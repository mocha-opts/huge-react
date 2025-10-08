import { scheduleMicrotask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitLayoutEffects,
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
	getNextLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
	markRootSuspended,
	mergeLanes,
	NoLane,
	NoLanes,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_NormalPriority as NormalPriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_cancelCallback,
	unstable_shouldYield
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
import { getSuspenseThenable, SuspenseException } from './thenable';
import { resetHooksOnUnwind } from './fiberHooks';
import { throwException } from './fiberThrow';
import { unwindWork } from './fiberUnwindWork';
//正在工作的node,类型是FiberNode 或者 null
let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane; //本次更新的Lane
let rootDoesHavePassiveEffects = false; //标记当前更新的root上是否存在useEffect

type RootExitStatus = number;

//工作中的状态
const RootInProgress = 0;
//并发更新 中途打断
const RootInComplete = 1;
// render完成
const RootCompleted = 2;
// 由于挂起，当前是未完成状态，不用进入commit阶段
const RootDidNotComplete = 3;

let wipRootExitStatus: number = RootInProgress;

type SuspendedReason = typeof NotSuspended | typeof SuspendedOnData;
const NotSuspended = 0;
const SuspendedOnData = 1;
let wipSuspendedReason: SuspendedReason = NotSuspended;
let wipThrownValue: any = null;

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishLane = NoLane;
	root.finishedWork = null;
	//wip初始化成重新创建的一个根节点了，然后又会从根节点开始更高优先级的render
	workInProgress = createWorkInProgress(root.current, {}); //root.current只想的hostRootFiber
	wipRootRenderLane = lane;

	wipRootExitStatus = RootInProgress;
	wipSuspendedReason = NotSuspended;
	wipThrownValue = null;
}

export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	//从当前出发更新的fiber，一直遍历到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	//接着执行renderRoot
	ensureRootIsScheduled(root);
}
//调度阶段入口
export function ensureRootIsScheduled(root: FiberRootNode) {
	//获取最高优先级 异步的优先级
	const updateLane = getNextLane(root);
	const existingCallback = root.callbackNode;

	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}
	//获取当前的优先级
	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		return;
	}
	//没有任务
	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}
	let newCallbackNode = null;

	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}任务中调度更新,优先级：`,
			updateLane
		);
	}
	//优先级是否是同步
	if (updateLane === SyncLane) {
		//同步优先级 用微任务调度

		//onClick中三个setState 也就会创建三个更新任务
		//最终会变成三个performSyncWorkOnRoot任务
		//[performSyncWorkOnRoot,performSyncWorkOnRoot,performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		scheduleMicrotask(flushSyncCallbacks);
	} else {
		//其他优先级 用 宏任务调度
		//获取调度器的优先级
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		//调度器调用回调函数
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			//@ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	//不管是同步还是并发更新结束了之后 更新
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
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
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	//并发更新开始的时候要  保证useEffect的回调执行完
	const curCallback = root.callbackNode;
	const didFlushPassiveEffects = flushPassiveEffects(
		root.pendingPassiveEffects
	);
	//如果触发更新的话
	if (didFlushPassiveEffects) {
		//代表了 当前useEffect触发的更新比当前执行的update优先级还要高
		if (root.callbackNode !== curCallback) {
			//当前的调度就不执行了 因为高优打断低优
			return null;
		}
	}
	const lane = getNextLane(root);
	const curCallbackNode = root.callbackNode;
	//防御性编程
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	//render阶段
	const exitStatus = renderRoot(root, lane, !needSync); //中断的话 existStatus =RootInComplete

	switch (exitStatus) {
		case RootInComplete:
			//被中断  还得看被中断的回调和当前的回调是否是同一个 决定是否走return 继续走perform的流程
			if (root.callbackNode !== curCallbackNode) {
				return null;
			}
			//中断前后的回调一致 就继续走这个逻辑 继续调度
			return performConcurrentWorkOnRoot.bind(null, root);
			break;
		case RootCompleted:
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			//本次更新消费的lane
			root.finishLane = lane;
			//更新结束以后重新初始化
			wipRootRenderLane = NoLane;
			commitRoot(root);
			break;
		case RootDidNotComplete:
			wipRootRenderLane = NoLane;
			markRootSuspended(root, lane);
			ensureRootIsScheduled(root);
			break;
		default:
			console.error('还未实现并发更新结束状态');

			break;
	}
}

//执行更新的过程 由ReactDOM.createRoot().render /this.setState/useState的dispatch方法触发
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getNextLane(root);

	if (nextLane !== SyncLane) {
		//其他比SyncLane低的优先级
		//NoLane
		ensureRootIsScheduled(root);
		return;
	}
	//
	const exitStatus = renderRoot(root, nextLane, false);

	switch (exitStatus) {
		case RootCompleted:
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			//本次更新消费的lane
			root.finishLane = nextLane;
			//更新结束以后重新初始化
			wipRootRenderLane = NoLane;
			commitRoot(root);
			break;
		case RootDidNotComplete:
			wipRootRenderLane = NoLane;
			markRootSuspended(root, nextLane);

			ensureRootIsScheduled(root);
			break;
		default:
			console.error('还未实现同步更新结束状态');
			break;
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}
	//判断当前root的renderlane ，不等于当前更新传入的lane 还需要初始化，否则的话是一个中断再继续的过程
	//并发更新的话 wipRootRenderLane 和当前运行的lane 是一致的 不会初始化
	//高优打断低优的请  之前调度wipRootRenderLane NormalLane的是低优 现在是lane SyncLane高优, 然后初始化
	if (wipRootRenderLane !== lane) {
		//初始化 让workInProgress指向第一个FiberNode
		//本次更新开始之前赋值Lane
		prepareFreshStack(root, lane);
	}

	//接着进入workloop更新的流程
	do {
		try {
			//挂起状态
			if (wipSuspendedReason !== NotSuspended && workInProgress !== null) {
				//先获取抛出的错误
				const thrownvalue = wipThrownValue;
				wipSuspendedReason = NotSuspended;
				wipThrownValue = null;
				//进入unwind流程
				throwAndUnwindWorkLoop(root, workInProgress, thrownvalue, lane);
			}
			shouldTimeSlice ? workLoopConcurrent() : workloopSync();
			//并发更新某时段中断的话就break掉 然后workInProgress 就!== null
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workloop发生错误');
			}
			handleThrow(root, e);
			// workInProgress = null;
		}
	} while (true);
	//标记了RootDidNotComplete 也就是没有被Suspense标签包裹，unwind流程一直往上直到根节点没有suspense包裹
	if (wipRootExitStatus !== RootInProgress) {
		return wipRootExitStatus;
	}

	if (shouldTimeSlice && workInProgress !== null) {
		// 中断执行 || render阶段执行完
		return RootInComplete;
	}
	//render阶段执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error(`render阶段结束时wip不应该不是null`);
	}
	//TODO 报错
	return RootCompleted;
}

function throwAndUnwindWorkLoop(
	root: FiberRootNode,
	unitOfWork: FiberNode,
	thrownValue: any,
	lane: Lane
) {
	//重置FC 全局变量
	resetHooksOnUnwind();
	//请求返回后重新触发更新
	throwException(root, thrownValue, lane);
	//unwind
	unwindUnitOfWork(unitOfWork);
}
function unwindUnitOfWork(unitOfWork: FiberNode) {
	let incompleteWork: FiberNode | null = unitOfWork;

	do {
		const next = unwindWork(incompleteWork);
		if (next !== null) {
			workInProgress = next;
			return;
		}
		const returnFiber = incompleteWork.return as FiberNode;
		if (returnFiber !== null) {
			returnFiber.deletions = null;
		}
		incompleteWork = returnFiber;
	} while (incompleteWork !== null);

	//使用了use 跑出了 data 但是没有定义suspense
	wipRootExitStatus = RootDidNotComplete;
	workInProgress = null;
}

function handleThrow(root: FiberRootNode, thrownValue: any) {
	//Error Boundary
	if (thrownValue === SuspenseException) {
		thrownValue = getSuspenseThenable();
		wipSuspendedReason = SuspendedOnData;
	}
	wipThrownValue = thrownValue;
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
		//有副作用要执行

		//阶段1/3:beforeMutation

		//阶段2/3:Mutation
		commitMutationEffects(finishedWork, root);
		//Fiber Tree切换
		root.current = finishedWork;
		//阶段3/3 Layout  (这个阶段的时候，之前的wip fiber 已经变成 current fiber )
		commitLayoutEffects(finishedWork, root);
	} else {
		//不存在对应的操作
		//Fiber Tree切换
		root.current = finishedWork;
	}
	rootDoesHavePassiveEffects = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffects = false;
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffects = true;
		commitHookEffectListUnmount(Passive, effect); //onmount的回调执行  实现LayoutEffect的话把Passive换成Layout就行
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffects = true;

		commitHookEffectListDestroy(Passive | HookHasEffect, effect); //对于Effect来说，不仅是Passive，还要加上HookHasEffect标记了才能触发
	});
	//本次更新的任何create回调都必须在上一次更新的destroy回调执行完之后执行
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffects = true;

		commitHookEffectListCreate(Passive | HookHasEffect, effect); //执行create回调
	});
	pendingPassiveEffects.update = [];

	//在useEffect回调中还有可能触发更新
	flushSyncCallbacks();
	return didFlushPassiveEffects;
}
function workloopSync() {
	//递归的过程
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}
function workLoopConcurrent() {
	//递归的过程  是否应该被中断 false 的话 不应该被中断，那就执行里面的逻辑
	while (workInProgress !== null && !unstable_shouldYield()) {
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
