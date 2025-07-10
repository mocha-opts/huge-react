import { Action } from 'shared/ReactTypes';

//react当前使用的hooks的集合
export interface Dispatcher {
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
}

//const [num, updateNum] = useState(0);
//const [num, updateNum] = useState((num)=>num+1);  useState传入的参数可以是改变状态的函数或者直接传入状态 返回的是数组 包含状态值及 改变状态的函数

export type Dispatch<State> = (action: Action<State>) => void;

const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;
	if (dispatcher === null) {
		throw new Error(
			'Hooks can only be called inside of the body of a function component.'
		);
	}
	return dispatcher;
};
export default currentDispatcher;
