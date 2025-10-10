import { ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromFragment,
	createFiberFromOffscreen,
	createWorkInProgress,
	FiberNode,
	OffscreenProps
} from './fiber';
import { UpdateQueue, processUpdateQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	MemoComponent,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';
import {
	cloneChildFibers,
	mountChildFibers,
	reconcileChildFibers
} from './childFibers';
import { bailoutHook, renderWithHooks } from './fiberHooks';
import { includeSomeLanes, Lane, NoLanes } from './fiberLanes';
import {
	ChildDeletion,
	DidCapture,
	NoFlags,
	Placement,
	Ref
} from './fiberFlags';
import {
	prepareToReadContext,
	propagateContextChange,
	pushProvider
} from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';
import { shallowEqual } from 'shared/shallowEqual';

//是否能命中bailout
let didReceiveUpdate = false;

export function markWipReceiveUpdate() {
	didReceiveUpdate = true;
}
//递归中的递
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	// 命中「性能优化」（bailout策略）的组件可以不通过reconcile生成wip.child，
	// 而是直接复用上次更新生成的wip.child。
	//1.props不变
	//2.state不变 两种情况可能造成state不变：
	// 不存在update
	// 存在update，但计算得出的state没变化
	//3.context不变
	//4.type不变
	didReceiveUpdate = false;
	const current = wip.alternate;

	if (current !== null) {
		const oldProps = current.memoizedProps;
		const newProps = wip.pendingProps;

		// 四要素~  props type
		if (oldProps !== newProps || current.type !== wip.type) {
			didReceiveUpdate = true;
		} else {
			//state context
			const hasScheduledStateOrContext = checkScheduledUpdateOrContext(
				current,
				renderLane
			);

			if (!hasScheduledStateOrContext) {
				//四要素~  state context 不变
				// 命中bailout
				didReceiveUpdate = false;
				switch (wip.tag) {
					case ContextProvider:
						const newValue = wip.memoizedProps.value;
						const context = wip.type._context;
						pushProvider(context, newValue);
						break;
					//	TODO suspense
				}
				return bailoutOnAlreadyFinishedWork(wip, renderLane);
			}
		}
	}

	// 告诉它消费完了
	wip.lanes = NoLanes;
	//比较 返回子fibernode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, wip.type, renderLane);
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip, renderLane);
		case SuspenseComponent:
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		case MemoComponent:
			return updateMemoComponent(wip, renderLane);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};
function updateMemoComponent(wip: FiberNode, renderLane: Lane) {
	//bailout四要素
	const current = wip.alternate;
	const nextProps = wip.pendingProps;
	const Component = wip.type.type;

	if (current !== null) {
		const prevProps = current.memoizedProps;

		//浅比较props
		if (shallowEqual(prevProps, nextProps) && current.ref === wip.ref) {
			didReceiveUpdate = false;
			wip.pendingProps = prevProps;

			//state context
			if (!checkScheduledUpdateOrContext(current, renderLane)) {
				//满足四要素
				wip.lanes = current.lanes;
				return bailoutOnAlreadyFinishedWork(wip, renderLane);
			}
		}
	}
	return updateFunctionComponent(wip, Component, renderLane);
}

function bailoutOnAlreadyFinishedWork(wip: FiberNode, renderLane: Lane) {
	if (!includeSomeLanes(wip.childLanes, renderLane)) {
		if (__DEV__) {
			console.warn('bailout整棵子树', wip);
		}
		return null;
	}

	if (__DEV__) {
		console.warn('bailout一个fiber', wip);
	}
	cloneChildFibers(wip);
	return wip.child;
}
function checkScheduledUpdateOrContext(
	current: FiberNode,
	renderLane: Lane
): boolean {
	const updateLanes = current.lanes;
	//未执行的更新中是否包含本次更新的lane
	if (includeSomeLanes(updateLanes, renderLane)) {
		return true; //本次更新所要执行的优先级  当前fiber中也存在优先级对应的update 也就代表当前fiber本次更新存在更新
	}
	return false;
}

function updateSuspenseComponent(wip: FiberNode) {
	const current = wip.alternate;
	const nextProps = wip.pendingProps;
	const fallback = nextProps.fallback;

	let showFallback = false;
	const didSuspend = (wip.flags & DidCapture) !== NoFlags;

	if (didSuspend) {
		showFallback = true;
		wip.flags &= ~DidCapture;
	}

	const nextPrimaryChildren = nextProps.children;
	const nextFallbackChildren = nextProps.fallback;
	pushSuspenseHandler(wip);

	if (current === null) {
		//mount
		if (showFallback) {
			//挂起
			return mountSuspenseFallbackChildren(
				wip,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			//正常
			return mountSuspensePrimaryChildren(wip, nextPrimaryChildren);
		}
	} else {
		//update
		if (showFallback) {
			//挂起
			return updateSuspenseFallbackChildren(
				wip,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			//正常
			return updateSuspensePrimaryChildren(wip, nextPrimaryChildren);
		}
	}
}
function updateSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const current = wip.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};

	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = null;
	wip.child = primaryChildFragment;

	if (currentFallbackChildFragment !== null) {
		const deletions = wip.deletions;
		if (deletions === null) {
			wip.deletions = [currentFallbackChildFragment];
			wip.flags |= ChildDeletion;
		} else {
			deletions.push(currentFallbackChildFragment);
		}
	}
	return primaryChildFragment;
}
function updateSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const current = wip.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	let fallbackChildFragment;

	if (currentFallbackChildFragment !== null) {
		fallbackChildFragment = createWorkInProgress(
			currentFallbackChildFragment,
			fallbackChildren
		);
	} else {
		fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
		fallbackChildFragment.flags |= Placement;
	}
	fallbackChildFragment.return = wip;
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;

	return fallbackChildFragment;
}
function mountSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);

	wip.child = primaryChildFragment;
	primaryChildFragment.return = wip;

	return primaryChildFragment;
}
function mountSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);

	const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);

	// 父组件Suspense已经mount，所以需要fallback标记Placement

	fallbackChildFragment.flags |= Placement;

	primaryChildFragment.return = wip;
	fallbackChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;

	return fallbackChildFragment;
}

function updateOffscreenComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateContextProvider(wip: FiberNode, renderLane: Lane) {
	const providerType = wip.type;
	const context = providerType._context;
	const newProps = wip.pendingProps;
	const oldProps = wip.memoizedProps;
	const newValue = newProps.value;

	pushProvider(context, newProps.value);

	if (oldProps !== null) {
		const oldValue = oldProps.value;

		if (
			Object.is(oldValue, newValue) &&
			oldProps.children === newProps.children
		) {
			return bailoutOnAlreadyFinishedWork(wip, renderLane);
		} else {
			//某个更新导致context变化
			propagateContextChange(wip, context, renderLane);
		}
	}

	const nextChildren = newProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

//获取FunctionComponent的子fibernode，怎么获取呢，运行一下就行
//function App(){return <div>123</div>}
function updateFunctionComponent(
	wip: FiberNode,
	Component: FiberNode['type'],
	renderLane: Lane
) {
	prepareToReadContext(wip, renderLane);
	//render
	const nextChildren = renderWithHooks(wip, Component, renderLane);

	const current = wip.alternate;
	if (current !== null && !didReceiveUpdate) {
		bailoutHook(wip, renderLane);
		return bailoutOnAlreadyFinishedWork(wip, renderLane);
	}

	reconcileChildren(wip, nextChildren);
	return wip.child; //最终会返回wip.child
}

//首屏渲染
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;

	const prevChildren = wip.memoizedState;

	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
	wip.memoizedState = memoizedState;

	const current = wip.alternate;

	// 考虑RootDidNotComplete的情况，需要复用memoizedState
	//双缓存树没有翻转 所以没有数据会白屏，复用
	if (current !== null) {
		if (!current.memoizedState) {
			current.memoizedState = memoizedState;
		}
	}

	const nextChildren = wip.memoizedState;
	if (prevChildren === nextChildren) {
		return bailoutOnAlreadyFinishedWork(wip, renderLane);
	}
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostComponent(wip: FiberNode) {
	//根据element创建fibernode
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	markRef(wip.alternate, wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate;
	if (current !== null) {
		//update
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		//mount
		wip.child = mountChildFibers(wip, null, children);
	}
}

function markRef(current: FiberNode | null, workInProgress: FiberNode) {
	const ref = workInProgress.ref;
	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		workInProgress.flags |= Ref;
	}
}
