import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane } from './fiberLanes';

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
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};
	if (pendingUpdate !== null) {
		const first = pendingUpdate.next; //第一个update
		let pending = pendingUpdate.next as Update<any>; //b
		do {
			const updateLane = pending.lane;
			if (updateLane === renderLane) {
				const action = pendingUpdate.action;
				if (action instanceof Function) {
					//baseState 1 update (x) => 4x -> memoizedState 4
					baseState = action(baseState);
				} else {
					//baseState 1 update 2 -> memoizedState 2
					baseState = action;
				}
			}
			pending = pending?.next as Update<any>;
		} while (pending !== first);
		//baseState 1 update 2 =>memorizedState 2
	} else {
		if (__DEV__) {
			console.error('不应该进入updateLane!==renderLane的分支');
		}
	}
	result.memoizedState = baseState;
	return result;
};
