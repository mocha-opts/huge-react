import { FiberNode, FiberRootNode } from './fiber';
import { Container } from 'hostConfig';
import { HostRoot } from './workTags';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './updateQueue';
import { ReactElementType } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
//mount时调用的api
//ReactDOM.createRoot 就会调用createContainer

//创建应用的根节点FiberRootNode，并将FIberROotNode和hostRootFiber连接起来
export function createContainer(container: Container) {
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	const root = new FiberRootNode(container, hostRootFiber);
	hostRootFiber.updateQueue = createUpdateQueue();
	return root;
}

//render方法内部就会调用updateContainer
//会创建update，并enqueue到updateQueue中，把首屏渲染与实现的触发更新的机制（updateQueue.ts文件中）连接起来
export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	const hostRootFiber = root.current;
	const update = createUpdate<ReactElementType | null>(element); //首屏渲染需要创建一个更新，这次更新和element相关
	//创建完update后，要插入到hostrootFiber的updateQueue中
	enqueueUpdate(
		hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
		update
	);
	scheduleUpdateOnFiber(hostRootFiber);
	return element;
}
