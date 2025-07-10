import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';

//UpdateQueue -> shared.pending -> update
export interface Update<State> {
	action: Action<State>;
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
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return { action };
};

//UpdateQueue实例化的方法
export const createUpdateQueue = <Action>() => {
	return { shared: { pending: null }, dispatch: null } as UpdateQueue<Action>;
};

export const enqueueUpdate = <Action>(
	updateQueue: UpdateQueue<Action>,
	update: Update<Action>
) => {
	updateQueue.shared.pending = update;
};

export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};
	if (pendingUpdate !== null) {
		//baseState 1 update 2 =>memorizedState 2
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			//baseState 1 update (x) => 4x -> memoizedState 4
			result.memoizedState = action(baseState);
		} else {
			//baseState 1 update 2 -> memoizedState 2
			result.memoizedState = action;
		}
	}

	return result;
};
