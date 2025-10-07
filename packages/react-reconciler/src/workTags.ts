export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText
	| typeof Fragment
	| typeof ContextProvider
	| typeof SuspenseComponent
	| typeof OffscreenComponent
	| typeof LegacyHiddenComponent
	| typeof ScopeComponent;

export const FunctionComponent = 0;
export const HostRoot = 3; //ReactDom.render('')
export const HostComponent = 5; //<div>123</div> 中的div对应的fibernode就是hostcomponent
export const HostText = 6; //123就是hosttext
export const Fragment = 7; //片段	<></>
export const ContextProvider = 8;

export const SuspenseComponent = 13;
export const OffscreenComponent = 14;
export const LegacyHiddenComponent = 15;
export const ScopeComponent = 16;
