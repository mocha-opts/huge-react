import { Container, appendChildToContainer } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags, Placement } from './fiberFlags';
import { HostComponent, HostRoot, HostText } from './workTags';
let nextEffect: FiberNode | null = null;
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		//向下遍历
		const child: FiberNode | null = nextEffect.child;

		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			nextEffect = child;
		} else {
			//不存在subtreeFlags的情况
			//向上遍历 DFS
			up: while (nextEffect !== null) {
				commitMutationEffectsOnFiber(nextEffect);
				//执行找sibling
				const sibling: FiberNode | null = nextEffect.sibling;
				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				nextEffect = nextEffect.return;
			}
		}
	}
};
/**
 * Commits the mutation effects on a Fiber node.
 *
 * @param {FiberNode} finishedWork - The Fiber node to commit the mutation effects on.
 * @return {void} No return value.
 */
const commitMutationEffectsOnFiber = (finishedWork: FiberNode) => {
	//当前的finishedWork是真正存在flags的fibernode
	const flags = finishedWork.flags; //获取flags
	//这个节点存在placement操作
	if ((flags & Placement) !== NoFlags) {
		//执行操作
		commitPlacement(finishedWork);
		//移除flags
		finishedWork.flags &= ~Placement;
	}
	//flags Update
	//flags ChildDeletion
};

const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('zhixingPlacementcaozuo', finishedWork);
	}

	//parent DOM 获得父级节点的dom元素才能执行插入
	const hostParent = getHostParent(finishedWork);

	//finishedWork ~~DOM
	if (hostParent !== null)
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
};

function getHostParent(fiber: FiberNode): Container | null {
	//向上遍历的过程
	let parent = fiber.return;
	while (parent) {
		const parentTag = parent.tag;
		//HostComponent HostRoot
		if (parentTag === HostComponent) {
			return parent.stateNode as Container;
		}
		if (parentTag === HostRoot) {
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}
	if (__DEV__) {
		console.warn('weizhaodao hostparent', fiber);
	}
	return null;
}

function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	//fiber root
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(finishedWork.stateNode, hostParent);
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;
		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
