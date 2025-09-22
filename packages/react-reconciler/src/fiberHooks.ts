import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import { FiberNode } from './fiber';
import internals from 'shared/internals';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	UpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';

let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;
const { currentDispatcher } = internals;

//存在fiberNode的memoizedState 指向的是 一条保存了hooks的单向链表 (useSate->useEffect->useContext->useSate)
//定义Hook 的数据结构
interface Hook {
	memoizedState: any;
	updateQueue: any;
	next: Hook | null;
}

export const renderWithHooks = (wip: FiberNode, lane: Lane) => {
	//记录当前正在render的FC对应的fibernode
	currentlyRenderingFiber = wip;

	//mount时要重置 保存hooks的链表
	wip.memoizedState = null; //重置，在下面的代码中间就会创建hooks相应的链表
	// wip.updateQueue = null;

	renderLane = lane;

	const current = wip.alternate;

	if (current !== null) {
		//update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		//mount
		currentDispatcher.current = HooksDispatcherOnMount; //mount阶段当前使用的hooks 的集合
	}

	const Component = wip.type; //函数保存在wip.type上
	const props = wip.pendingProps;
	const children = Component(props); // FC render
	//执行函数，得到子元素

	//重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
};

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState
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
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

function updateState<State>(): [State, Dispatch<State>] {
	//找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();
	//实现update中计算新state的逻辑
	//依据update来计算，它保存在queue里
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	if (pending !== null) {
		//对于一个usestate memoizedState就是保存了他的状态
		const { memoizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

//hook数据从哪来？ =》currentHook
//交互阶段触发的更新usestate中的setState
//render阶段时触发的更新
//function App() {
//   const [num, update] = useState(0);
//   // 触发更新
//   update(100);
//   return <div>{num}</div>;
// }
function updateWorkInProgressHook(): Hook {
	//TODO render阶段时触发的更新
	let nextCurrentHook: Hook | null;
	if (currentHook === null) {
		//这是FC update 时的第一个hook
		const current = currentlyRenderingFiber?.alternate;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState; //p1的u1
		} else {
			//mount阶段currentFiber = null
			nextCurrentHook = null;
		}
	} else {
		// 这是FC update 时的后续的第二个，第三个...hook
		nextCurrentHook = currentHook.next; //更新u2时，currentHook为p1的u1
	}
	if (nextCurrentHook === null) {
		//mount/update p1 u1 u2 u3
		//update      p2 u1 u2 u3 u4
		//if里面加了个usestate 导致多了个hook，更新u4，currentHook是上一个更新的u3，u3.next=null 也就是nextCurrentHook=null
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的hook比上次执行时多`
		);
	}
	//复用nextCurrentHook
	currentHook = nextCurrentHook as Hook;
	//基于之前的u1复制成新的hook
	const newHook: Hook = {
		memoizedState: currentHook?.memoizedState,
		updateQueue: currentHook?.updateQueue,
		next: null
	};
	//接下来和mount一样，更新workInProgressHook
	if (workInProgressHook === null) {
		//workInProgressHook 没有hook 也就是说明这是mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook; //指向第一个hook
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		//mount时 中间的hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	//最终返回workInProgressHook
	return workInProgressHook;
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	//和hostroot更新流程类似
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane); //对于触发更新的FC 对应的fiber进行schedule
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
