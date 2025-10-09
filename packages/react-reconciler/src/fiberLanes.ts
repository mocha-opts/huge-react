import {
	unstable_getCurrentPriorityLevel,
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { FiberRootNode } from './fiber';
import ReactCurrentBatchConfig from 'react/src/currentBatchConfig';

export type Lane = number;
export type Lanes = number;

export const NoLane = 0b00000;
export const NoLanes = 0b00000;
export const SyncLane = 0b00001;
export const InputContinuousLane = 0b00010; //连续输入  拖拽等
export const DefaultLane = 0b00100;
export const TransitionLane = 0b01000;
export const IdleLane = 0b10000;
export const NoTimestamp = -1;

export const SyncHydrationLane = SyncLane + 1;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

export function requestUpdateLane() {
	const isTransition = ReactCurrentBatchConfig.transition !== null;
	if (isTransition) {
		return TransitionLane;
	}
	//从上下文环境中获取Scheduler优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	const lane = schedulerPriorityToLane(currentSchedulerPriority);
	return lane;
}
export function removeLanes(set: Lanes, subset: Lane | Lanes): Lanes {
	return set & ~subset;
}
export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	return (set & subset) === subset;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = removeLanes(root.pendingLanes, lane);

	root.suspendedLanes = NoLanes;
	root.pingedLanes = NoLanes;
	// if (root.finishLane === NoLane || root.finishLane > lane) {
	// 	root.finishLane = lane;
	// }
}
export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes);
	if (lane === SyncLane) {
		return unstable_ImmediatePriority;
	}
	if (lane === InputContinuousLane) {
		return unstable_UserBlockingPriority;
	}
	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}
	return unstable_IdlePriority;
}
export function schedulerPriorityToLane(schedulerPriority: number): Lane {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
}

export function markRootPinged(root: FiberRootNode, pingedLane: Lane) {
	//所有pingedLanes 一定是suspendedLanes的子集，只有先被挂起了 才会被ping，取到相交的部分 保留
	root.pingedLanes |= root.suspendedLanes & pingedLane;
}

export function markRootSuspended(root: FiberRootNode, suspendedLane: Lane) {
	//完善suspense
	root.suspendedLanes |= suspendedLane;
	root.pingedLanes &= ~suspendedLane; //从pingedLanes移除
}

export function getNextLane(root: FiberRootNode): Lane {
	const pendingLanes = root.pendingLanes;

	if (pendingLanes === NoLanes) {
		return NoLane;
	}
	let nextLane = NoLane;

	// 排除掉挂起的lane
	const suspendedLanes = pendingLanes & ~root.suspendedLanes; //pendingLanes中没有被挂起的Lane
	if (suspendedLanes !== NoLanes) {
		nextLane = getHighestPriorityLane(suspendedLanes);
	} else {
		//没有的话 看pendingLanes中有没有被ping的
		const pingedLanes = pendingLanes & root.pingedLanes;
		if (pingedLanes !== NoLanes) {
			nextLane = getHighestPriorityLane(pingedLanes);
		}
	}
	return nextLane;
}

export function includeSomeLanes(set: Lanes, subset: Lane | Lanes) {
	return (set & subset) !== NoLanes;
}
