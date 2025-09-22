import {
	Container,
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { NoFlags, Update } from './fiberFlags';
import { updateFiberProps } from 'react-dom/src/SyntheticEvent';

//递归中的递
export const completeWork = (wip: FiberNode) => {
	//递归中的归;

	const newProps = wip.pendingProps;
	const current = wip.alternate;

	switch (wip.tag) {
		case HostComponent:
			//检查当前 Fiber 是否存在对应的 DOM 实例
			if (current !== null && wip.stateNode) {
				//update
				//比如class a -> b 标记更新
				//1.props 是否变化 {onClick:xx} {onClick:xx}
				//2.变了 打 Update flag -> 然后到commit阶段的CommitWork 中的commitUpdate方法 ->HostConfig中调用
				//FiberNode.updateQueue = [className,'aaa',title,"222"]
				//TODO 判断变化
				updateFiberProps(wip.stateNode, newProps);
			} else {
				//mount
				//1. 构建DOM
				//				const instance = createInstance(wip.type, newProps);
				const instance = createInstance(wip.type, newProps);
				//2. 将DOM插入到DOM树中
				appendAllChildren(instance, wip);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostText:
			if (current !== null && wip.stateNode) {
				//update
				const oldText = current.memoizedProps.content;
				const newText = newProps.content;
				if (oldText !== newText) {
					markUpdate(wip);
				}
			} else {
				//mount
				//1. 构建DOM
				// const instance = createTextInstance(wip.type, newProps);
				const instance = createTextInstance(newProps.content);

				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostRoot:
		case FunctionComponent:
		case Fragment:
			bubbleProperties(wip);
			return null;

		default:
			if (__DEV__) {
				console.warn('未处理的completework情况', wip);
			}
			break;
	}
};

function appendAllChildren(parent: Container, wip: FiberNode) {
	let node = wip.child;

	while (node !== null) {
		if (node?.tag === HostComponent || node?.tag === HostText) {
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === wip) {
			return;
		}
		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				return;
			}
			node = node?.return;
		}
		node.sibling.return = node?.return;
		node = node.sibling;
	}
}

function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		subtreeFlags |= child.subtreeFlags;
		subtreeFlags |= child.flags;

		child.return = wip;
		child = child.sibling;
	}
	wip.subtreeFlags |= subtreeFlags;
}
function markUpdate(fiber: FiberNode) {
	fiber.flags |= Update;
}
