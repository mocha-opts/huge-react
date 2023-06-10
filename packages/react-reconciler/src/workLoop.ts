import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import { FiberNode, FiberRootNode, createWorkInProgress } from './fiber';
import { HostRoot } from './workTags';
//正在工作的node,类型是FiberNode 或者 null
let workInProgress: FiberNode | null = null;

function prepareFreshStack(root: FiberRootNode) {
	workInProgress = createWorkInProgress(root.current, {}); //root.current只想的hostRootFiber
}

export function scheduleUpdateOnFiber(fiber: FiberNode) {
	//TODO调度功能
	//从当前出发更新的fiber，一直遍历到fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	//接着执行renderRoot
	renderRoot(root);
}
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}
//执行更新的过程 由ReactDOM.createRoot().render /this.setState/useState的dispatch方法触发
function renderRoot(root: FiberRootNode) {
	//初始化 让workInProgress指向第一个FiberNode
	prepareFreshStack(root);
	//接着进入workloop更新的流程
	do {
		try {
			workloop();
			break;
		} catch (error) {
			console.warn('workloop发生错误');
			workInProgress = null;
		}
	} while (true);
}

function workloop() {
	//递归的过程
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber); //如果有子节点,就遍历子节点.可能是fiber的子fiber 也可能是null,null的话这个fiber没有子fiber
	fiber.memoizeProps = fiber.pendingProps; //递的工作完了,就把之前的props赋值给memoizeProps(pendingProps 是开始工作前的props)
	if (next === null) {
		//没有子节点就遍历兄弟节点
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
