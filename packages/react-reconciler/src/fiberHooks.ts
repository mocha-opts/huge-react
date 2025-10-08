import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import { FiberNode } from './fiber';
import internals from 'shared/internals';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update,
	UpdateQueue
} from './updateQueue';
import { Action, ReactContext, Thenable, Usable } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols';
import { trackUsedThenable } from './thenable';

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
	baseState: any;
	baseQueue: Update<any> | null;
}

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: EffectDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}
type EffectCallback = () => void;
type EffectDeps = any[] | null;

export const renderWithHooks = (wip: FiberNode, lane: Lane) => {
	//记录当前正在render的FC对应的fibernode
	currentlyRenderingFiber = wip;

	//mount时要重置 保存hooks的链表 重置 hooks链表
	wip.memoizedState = null;
	//重置effect链表
	wip.updateQueue = null;
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
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use
};

function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}
function updateRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}
function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}
function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;
	if (currentHook != null) {
		//
		const prevEffect = currentHook.memoizedState as Effect; //当前Hook在上一次更新时对应的effect
		destroy = prevEffect.destroy;
		if (nextDeps !== null) {
			//进行依赖比较
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				//依赖没有变化 不需要执行create
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		//浅比较不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}
function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	//useEffect(()=>{},) 没有传入依赖的情况
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null //next指向下一个effect
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		//mount时 第一个effect
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		// fcUpdateQueue.lastEffect = effect.next = effect; //环状链表
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		//update时 或者mount时 不是第一个effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			// updateQueue.lastEffect = effect.next = effect;
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}
function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

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
	hook.baseState = memoizedState;

	//@ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	//function App(){
	//	const [x,dispatch] = 	useState()
	// window.dispatch = dispatch; //也能执行成功，这是因为dispatchSetState绑定了当前的fiber
	//}
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false);
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start; //start保存在	hook.memoizedState updateTransition就可以在这里取到
	return [isPending, start];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true); //触发一次高优先级的同步更新 把pending 变成true
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);
	currentBatchConfig.transition = prevTransition;
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

function updateState<State>(): [State, Dispatch<State>] {
	//找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();
	//实现update中计算新state的逻辑
	//依据update来计算，它保存在queue里
	const queue = hook.updateQueue as UpdateQueue<State>;
	const baseState = hook.baseState;
	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;

	//一定会执行更新  但有了并发更新 ，这次更新可能被高优打断 ，
	// 低优更新一旦被赋值为null 已经计算出来一个结果，这个结果还没到commit阶段就被打断了，重新开始一个高优先级的更新，name低优先级的更新被清零
	// queue.shared.pending = null;
	//所以需要保存在current中

	if (pending !== null) {
		//对于一个usestate memoizedState就是保存了他的状态

		//pending baseQueue update保存在current中
		if (baseQueue !== null) {
			//存在 就和pendingqueue 合并
			// baseQueue b2 -> b0 -> b1 -> b2
			//pendingQueue p2 -> p0 -> p1 -> p2

			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;
			//b2指向p0  b2 -> p0
			baseQueue.next = pendingFirst;
			//p2指向p0  p2 -> b0
			pending.next = baseFirst;

			//最终 p2->b0->b1->b2->p0->p1->p2
		}
		baseQueue = pending;
		//保存在current中
		current.baseQueue = pending;
		queue.shared.pending = null;
	}
	if (baseQueue !== null) {
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(hook.memoizedState, baseQueue, renderLane);
		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;
	}
	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
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

// function App(){
// 	useState()  //这种情况下执行useState的话 currentlyRenderingFiber指向App对应的fiber
// }
//而不在FC组件内的话 currentlyRenderingFiber就是null

function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		baseState: null,
		baseQueue: null,
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
	return workInProgressHook;
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
		const current = (currentlyRenderingFiber as FiberNode).alternate;
		if (current !== null) {
			nextCurrentHook = current.memoizedState; //p1的u1
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
			`组件${
				(currentlyRenderingFiber?.type, name)
			}本次执行时的hook比上次执行时多`
		);
	}
	//复用nextCurrentHook
	currentHook = nextCurrentHook as Hook;
	//基于之前的u1复制成新的hook
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		baseState: currentHook.baseState,
		baseQueue: currentHook.baseQueue,
		next: null
	};
	//接下来和mount一样，更新workInProgressHook
	if (workInProgressHook === null) {
		//workInProgressHook 没有hook 也就是说明这是update时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook; //指向第一个hook
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	//最终返回workInProgressHook
	return workInProgressHook;
}

function readContext<T>(context: ReactContext<T>) {
	const consumer = currentlyRenderingFiber; //当前render阶段的fiber
	//代表了 useContext脱离了函数组件使用，比如说在window.调用useContext，此时就获取不到当前正在render的fiber
	if (consumer === null) {
		throw new Error('context需要有consumer，只能在函数组件中调用useContext');
	}
	const value = context._currentValue;
	return value;
}

function use<T>(usable: Usable<T>): T {
	if (usable !== null && typeof usable === 'object') {
		if (typeof (usable as Thenable<T>).then === 'function') {
			//thenable
			const thenable = usable as Thenable<T>;
			return trackUsedThenable(thenable);
		} else if ((usable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			const context = usable as ReactContext<T>;
			return readContext(context);
		}
	}
	throw new Error('不支持的use参数 ' + usable);
}

export function resetHooksOnUnwind() {
	currentlyRenderingFiber = null;
	currentHook = null;
	workInProgressHook = null;
}
