import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { isSubsetOfLanes, Lane, NoLane } from './fiberLanes';

//UpdateQueue -> shared.pending -> update
export interface Update<State> {
	action: Action<State>;
	next?: Update<any> | null; //指向下一个update 实现环状链表
	lane: Lane;
}
//this.setState({x:1})
//this.setState({xx:1},()=>{{xx:2}});
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}
//代表更新的数据结构Update  Update实例化的方法
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	return { action, lane, next: null };
};

//UpdateQueue实例化的方法
export const createUpdateQueue = <Action>() => {
	return { shared: { pending: null }, dispatch: null } as UpdateQueue<Action>;
};

export const enqueueUpdate = <Action>(
	updateQueue: UpdateQueue<Action>,
	update: Update<Action>
) => {
	const pending = updateQueue.shared.pending;
	if (pending === null) {
		//这是update是第一个update
		// a -> a
		update.next = update;
	} else {
		//不是第一个update
		//b.next = a.next
		update.next = pending.next;
		//a.next = b
		pending.next = update;
	}
	//pending 永远指向最后一个update pending = b -> a -> b
	updateQueue.shared.pending = update;
};

export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null, //pending queue是已经合并过后的结果
	renderLane: Lane
): {
	memoizedState: State;
	baseState: State; //为最后一个没被跳过的update计算后的结果 ，newState 和newBaseState可能是不一致的
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null //初始为null
	};
	if (pendingUpdate !== null) {
		const first = pendingUpdate.next; //第一个update
		let pending = pendingUpdate.next as Update<any>; //b

		let newBaseState = baseState;
		let newBaseQueueFirst: Update<State> | null = null; //链表头
		let newBaseQueueLast: Update<State> | null = null; //链表尾
		let newState = baseState; //一次计算得出的结果 最终计算出来的结果会被赋值给memorizedState

		do {
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				//优先级不够 被跳过
				//被跳过的update
				const clone = createUpdate(pending.action, pending.lane);
				//是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					//first = u0 last = u0
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					newBaseState = newState; //被固定下来
				} else {
					//first u0 -> u1
					//last u1
					(newBaseQueueLast as Update<State>).next = clone; //u0.next -> u1  u1.next - >u2
					newBaseQueueLast = clone; //last 赋值为clone last = u1  first = u0 -> u1 | last = u2 first=u0 -> u1 ->u2
				}
			} else {
				//优先级足够
				//先判断之前有没有被跳过的
				if (newBaseQueueLast !== null) {
					const clone = createUpdate(pending.action, NoLane);
					//插入到basequeue中
					newBaseQueueLast.next = clone;
					newBaseQueueLast = clone;
				}
				const action = pendingUpdate.action;
				if (action instanceof Function) {
					//baseState 1 update (x) => 4x -> memoizedState 4
					newState = action(baseState);
				} else {
					//baseState 1 update 2 -> memoizedState 2
					newState = action;
				}
			}
			pending = pending?.next as Update<any>;
		} while (pending !== first);
		//baseState 1 update 2 =>memorizedState 2
		if (newBaseQueueLast === null) {
			//本次计算没有update被跳过
			newBaseState = newState;
		} else {
			newBaseQueueLast.next = newBaseQueueFirst; //组成环状链表
		}
		result.memoizedState = newState;
		result.baseState = newBaseState;
		result.baseQueue = newBaseQueueLast;
	} else {
		if (__DEV__) {
			console.error('不应该进入updateLane!==renderLane的分支');
		}
	}
	return result;
};
