import { FiberRootNode } from './fiber';

export type Lane = number;

export type Lanes = number;

export const NoLane = 0b000;

export const SyncLane = 0b001;

// export const InputContinuousLane = 0b0000000000000000000000000100000;

// export const DefaultLane = 0b0000000000000000000100000000000;

// export const IdleLane = 0b1000000000000000000000000000000;

export const NoLanes = 0b000;

export const NoTimestamp = -1;

export const SyncHydrationLane = SyncLane + 1;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

export function requestUpdateLane() {
	return SyncLane;
}
export function removeLanes(lanes: Lanes, subset: Lanes): Lanes {
	return lanes & ~subset;
}
export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = removeLanes(root.pendingLanes, lane);
	// if (root.finishLane === NoLane || root.finishLane > lane) {
	// 	root.finishLane = lane;
	// }
}
export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}
