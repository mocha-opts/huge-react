import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import ReactCurrentBatchConfig from './src/currentBatchConfig';
import { jsxDEV, jsx, isValidElement as isValidElementFn } from './src/jsx';
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};
//内部数据共享层
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	ReactCurrentBatchConfig
};
export const version = '0.0.0';

//TODO 根据环境区分jsx 和 jsxDev
export const createElement = jsx;

export const isValidElement = isValidElementFn;
