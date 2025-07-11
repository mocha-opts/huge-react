import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import { FiberNode } from './fiber';
import internals from 'shared/internals';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	UpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;

const { currentDispatcher } = internals;

//存在fiberNode的memoizedState 指向的是 一条保存了hooks的单向链表 (useSate->useEffect->useContext->useSate)
//定义Hook 的数据结构
interface Hook {
	memoizedState: any;
	updateQueue: any;
	next: Hook | null;
}

export const renderWithHooks = (wip: FiberNode) => {
	//记录当前正在render的FC对应的fibernode
	currentlyRenderingFiber = wip;
	wip.memoizedState = null; //重置在下面的代码中间就会创建hooks相应的链表
	wip.updateQueue = null;

	const current = wip.alternate;

	if (current !== null) {
		//update
	} else {
		//mount
		currentDispatcher.current = HooksDispatcherOnMount; //mount阶段当前使用的hooks 的集合
	}

	const Component = wip.type; //函数保存在wip.type上
	const props = wip.pendingProps;
	const children = Component(props); //执行函数，得到子元素

	//重置操作
	currentlyRenderingFiber = null;
	return children;
};

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	//找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}
	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	//@ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	//function App(){
	//	const [x,dispatch] = 	useState()
	// window.dispatch = dispatch; //也能执行成功，这是因为dispatchSetState绑定了当前的fiber
	//}
	return [memoizedState, dispatch];
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	//和hostroot更新流程类似
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber); //对于触发更新的FC 对应的fiber进行schedule
}
function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null
	};
	if (workInProgressHook === null) {
		//workInProgressHook 没有hook 也就是说明这是mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook; //指向第一个hook
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		//mount时 中间的hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}
	return hook;
}

// function App(){
// 	useState()  //这种情况下执行useState的话 currentlyRenderingFiber指向App对应的fiber
// }
//而不在FC组件内的话 currentlyRenderingFiber就是null
