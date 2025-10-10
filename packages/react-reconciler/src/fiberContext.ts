import { ReactContext } from 'shared/ReactTypes';
import {
	includeSomeLanes,
	isSubsetOfLanes,
	Lane,
	mergeLanes,
	NoLanes
} from './fiberLanes';
import { FiberNode } from './fiber';
import { markWipReceiveUpdate } from './beginWork';
import { ContextProvider } from './workTags';

export interface ContextItem<Value> {
	context: ReactContext<Value>;
	memoizedState: Value;
	next: ContextItem<Value> | null;
}
let prevContextValue: any = null;

const prevContextValueStack: any[] = [];

let lastContextDep: ContextItem<any> | null;

export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	prevContextValueStack.push(prevContextValue);
	prevContextValue = context._currentValue;
	context._currentValue = newValue;
}

export function popProvider<T>(context: ReactContext<T>) {
	context._currentValue = prevContextValue; //上一个context._currentValue
	prevContextValue = prevContextValueStack.pop();
}

export function prepareToReadContext(wip: FiberNode, renderLane: Lane) {
	lastContextDep = null;

	const deps = wip.dependencies;
	if (deps !== null) {
		const firstContext = deps.firstContext;
		if (firstContext !== null) {
			if (includeSomeLanes(deps.lanes, renderLane)) {
				markWipReceiveUpdate();
			}
			deps.firstContext = null;
		}
	}
}

export function readContext<T>(
	consumer: FiberNode | null, //当前render阶段的fiber
	context: ReactContext<T>
) {
	//代表了 useContext脱离了函数组件使用，比如说在window.调用useContext，此时就获取不到当前正在render的fiber
	if (consumer === null) {
		throw new Error('context需要有consumer，只能在函数组件中调用useContext');
	}
	const value = context._currentValue;
	//建立 fiber -> context
	//每次函数组件render的的时候就重置一下lastContextDep 函数组件每调用一次useContext，就把它赋到dependencies的链表上
	const contextItem: ContextItem<T> = {
		context,
		next: null,
		memoizedState: value
	};
	if (lastContextDep === null) {
		lastContextDep = contextItem;
		consumer.dependencies = {
			firstContext: contextItem,
			lanes: NoLanes
		};
	} else {
		lastContextDep = lastContextDep.next = contextItem;
	}
	return value;
}

export function propagateContextChange<T>(
	wip: FiberNode,
	context: ReactContext<T>,
	renderLane: Lane
) {
	let fiber = wip.child;
	if (fiber !== null) {
		fiber.return = wip;
	}

	while (fiber !== null) {
		let nextFiber = null;
		const deps = fiber.dependencies;
		if (deps !== null) {
			//函数组件 并且这个函数组件依赖了某些context
			nextFiber = fiber.child;
			let contextItem = deps.firstContext;
			while (contextItem !== null) {
				if (contextItem.context === context) {
					//找到了
					fiber.lanes = mergeLanes(fiber.lanes, renderLane);
					const alternate = fiber.alternate;
					if (alternate !== null) {
						alternate.lanes = mergeLanes(alternate.lanes, renderLane);
					}
					//往上

					scheduleContextWorkOnParentPath(fiber.return, wip, renderLane);
					deps.lanes = mergeLanes(deps.lanes, renderLane);

					break;
				}
				contextItem = contextItem.next;
			}
		} else if (fiber.tag === ContextProvider) {
			//<ctx.Provider> <Cpn/> <ctx111.Provider> ...
			nextFiber = fiber.type === wip.type ? null : fiber.type;
		} else {
			nextFiber = fiber.child;
		}

		if (nextFiber !== null) {
			nextFiber.return = fiber;
		} else {
			//到了叶子结点
			while (nextFiber !== null) {
				if (nextFiber === wip) {
					nextFiber = null;
					break;
				}
				const sibling = nextFiber.sibling;
				if (sibling !== null) {
					sibling.return = nextFiber.return;
					nextFiber = sibling;
					break;
				}
				nextFiber = nextFiber.return;
			}
		}
		fiber = nextFiber;
	}
}

function scheduleContextWorkOnParentPath(
	from: FiberNode | null,
	to: FiberNode,
	renderLane: Lane
) {
	let node = from;

	while (node !== null) {
		const alternate = node.alternate;

		if (!isSubsetOfLanes(node.childLanes, renderLane)) {
			node.childLanes = mergeLanes(node.childLanes, renderLane);

			if (alternate !== null) {
				alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
			}
		} else if (
			alternate !== null &&
			!isSubsetOfLanes(alternate.childLanes, renderLane)
		) {
			alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
		}
		if (node === to) {
			break;
		}
		node = node.return;
	}
}
