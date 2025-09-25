import { scheduleMicrotask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	FiberRootNode,
	createWorkInProgress,
	PendingPassiveEffects
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	getHighestPriorityLane,
	Lane,
	markRootFinished,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_NormalPriority as NormalPriority,
	unstable_scheduleCallback as scheduleCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
//正在工作的node,类型是FiberNode 或者 null
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane; //本次更新的Lane
let rootDoesHavePassiveEffects = false; //标记当前更新的root上是否存在useEffect
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	workInProgress = createWorkInProgress(root.current, {}); //root.current只想的hostRootFiber
	wipRootRenderLane = lane;
}

function markRootUpdate(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	//从当前出发更新的fiber，一直遍历到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdate(root, lane);
	//接着执行renderRoot
	ensureRootIsScheduled(root);
}
//调度阶段入口
function ensureRootIsScheduled(root: FiberRootNode) {
	//TODO 调度功能
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	if (updateLane === NoLane) {
		return;
	}
	if (updateLane === SyncLane) {
		//同步优先级 用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度更新,优先级：', updateLane);
		}
		//onClick中三个setState 也就会创建三个更新任务
		//最终会变成三个performSyncWorkOnRoot任务
		//[performSyncWorkOnRoot,performSyncWorkOnRoot,performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		scheduleMicrotask(flushSyncCallbacks);
	} else {
		//其他优先级 用 宏任务调度
	}
}
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}
//执行更新的过程 由ReactDOM.createRoot().render /this.setState/useState的dispatch方法触发
function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		//其他比SyncLane低的优先级
		//NoLane
		ensureRootIsScheduled(root);
		return;
	}
	if (__DEV__) {
		console.warn('开始进入render阶段');
	}
	//初始化 让workInProgress指向第一个FiberNode
	//本次更新开始之前赋值Lane
	prepareFreshStack(root, lane);

	//接着进入workloop更新的流程
	do {
		try {
			workloop();
			break;
		} catch (error) {
			if (__DEV__) {
				console.warn('workloop发生错误');
			}
			workInProgress = null;
		}
	} while (true);

	const finishedWork = root.current.alternate;
	console.warn('commitRoot', root);
	root.finishedWork = finishedWork;
	//本次更新消费的lane
	root.finishLane = lane;
	//更新结束以后重新初始化
	wipRootRenderLane = NoLane;
	commitRoot(root);
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}
	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	const lane = root.finishLane;
	if (lane === NoLane && __DEV__) {
		console.error('commit阶段 finishedLane 不应该是 NoLane');
	}
	//重置
	root.finishedWork = null;
	root.finishLane = NoLane;

	markRootFinished(root, lane);

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		//当前fiber树中存在函数组件需要执行useEffect的回调
		if (!rootDoesHavePassiveEffects) {
			rootDoesHavePassiveEffects = true;
			// 调度effect 副作用
			scheduleCallback(NormalPriority, () => {
				//执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	//判断是否存在3个子阶段需要执行的操作
	//root flags root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		//执行子阶段
		//beforeMutation

		//mutation Placement
		commitMutationEffects(finishedWork, root);

		root.current = finishedWork;
		//layout
	} else {
		//不存在对应的操作
		root.current = finishedWork;
	}
	rootDoesHavePassiveEffects = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	pendingPassiveEffects.unmount.forEach((effect) => {
		commitHookEffectListUnmount(Passive, effect); //onmount的回调执行  实现LayoutEffect的话把Passive换成Layout就行
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListDestroy(Passive | HookHasEffect, effect); //对于Effect来说，不仅是Passive，还要加上HookHasEffect标记了才能触发
	});
	//本次更新的任何create回调都必须在上一次更新的destroy回调执行完之后执行
	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListCreate(Passive | HookHasEffect, effect); //执行create回调
	});
	pendingPassiveEffects.update = [];

	//在useEffect回调中还有可能触发更新
	flushSyncCallbacks();
}
function workloop() {
	//递归的过程
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber, wipRootRenderLane); //如果有子节点,就遍历子节点.可能是fiber的子fiber 也可能是null,null的话这个fiber没有子fiber
	fiber.memoizedProps = fiber.pendingProps; //递的工作完了,就把之前的props赋值给memoizeProps(pendingProps 是开始工作前的props)
	if (next === null) {
		//没有子节点就遍历兄弟节点
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
