import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import ReactCurrentBatchConfig from './src/currentBatchConfig';
import { jsxDEV, jsx, isValidElement as isValidElementFn } from './src/jsx';
import { Usable } from 'shared/ReactTypes';
export { createContext } from './src/context';
export {
	REACT_FRAGMENT_TYPE as Fragment,
	REACT_PROVIDER_TYPE as Provider,
	REACT_SUSPENSE_TYPE as Suspense
} from 'shared/ReactSymbols';

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

export const useRef: Dispatcher['useRef'] = (initialValue) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useRef(initialValue);
};

export const useContext: Dispatcher['useContext'] = (context) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useContext(context);
};
export const use: Dispatcher['use'] = <T>(usable: Usable<T>) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.use(usable);
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
