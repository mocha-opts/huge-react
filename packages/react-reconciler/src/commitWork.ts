import {
	Container,
	Instance,
	appendChildToContainer,
	commitUpdate,
	insertChildToContainer,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import {
	ChildDeletion,
	MutationMask,
	NoFlags,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
let nextEffect: FiberNode | null = null;
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		//向下遍历
		const child: FiberNode | null = nextEffect.child;

		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null //存在mutation阶段需要执行的操作
		) {
			//说明子节点有存在mutation阶段需要执行的操作
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
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		//移除flags
		finishedWork.flags &= ~Update;
	}

	//flags ChildDeletion

	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete);
			});
		}
		//移除flags
		finishedWork.flags &= ~Placement;
	}
};

function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	//1.找到第一个root host节点
	const lastOne = childrenToDelete[childrenToDelete.length - 1];
	if (!lastOne) {
		childrenToDelete.push(unmountFiber);
	} else {
		let node = lastOne.sibling;
		while (node !== null) {
			if (node === unmountFiber) {
				childrenToDelete.push(unmountFiber);
			}

			node = node.sibling;
		}
	}
	//2.每找到一个host节点，判断下这个节点是不是 1找到那个节点的兄弟节点
}
//递归删除子树，
// 1.fc 执行相对应的useEffect unmount 解绑ref等
// 2.hostcomponent 解绑ref
// 3.对于子树的根hostcomponent需要移除dom
const commitDeletion = (childToDelete: FiberNode) => {
	//
	const rootChildrenToDelete: FiberNode[] = [];

	//递归子树
	commitNestedComponent(childToDelete, (unmountFiber: FiberNode) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				//TODO 解绑ref
				return;
			case HostText:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);

				//TODO 解绑ref
				return;
			case FunctionComponent:
				//TODO useEffect unmount
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
				return;
		}
	});

	//移除rootHostComponent的DOM
	if (rootChildrenToDelete.length) {
		const hostParent = getHostParent(childToDelete); //先找到hostparent,即要删掉的子树中的根fiber节点的host类型parent
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild((node as FiberNode).stateNode, hostParent); //hostconfig中 ，然后在这个hostParent中删除下面的节点
			});
		}
	}
	childToDelete.return = null;
	childToDelete.child = null;
	childToDelete.sibling = null;
};

//<div>
//	<App/>
//	<p/>
//</div>

//function App(){
//	return <p>12</p>
//}

//以上执行顺序，先div触发commitNestedComponent
//再App触发commitNestedComponent
//再App下的p触发commitNestedComponent
//再p.12触发commitNestedComponent
//再div.p
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	let node = root;
	while (true) {
		onCommitUnmount(node);
		if (node.child !== null) {
			//向下遍历
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === root) {
			//终止条件
			return;
		}
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return;
			}
			//向上归
			node = node?.return;
		}
		node.sibling.return = node?.return;
		node = node.sibling;
	}
}

const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
		console.log('finishedWork', finishedWork);
	}

	//parent DOM 获得父级节点的dom元素才能执行插入
	const hostParent = getHostParent(finishedWork);
	//host sibling
	const sibling = getHostSibling(finishedWork);

	//finishedWork ~~DOM append parent DOM
	if (hostParent !== null)
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
};
//先遍历同级的兄弟节点，每遍历到的同时都向下遍历 找它子孙节点中的Host类型，如果找到了一个稳定的且为Host类型的节点就返回
//如果向下遍历没找到且所有兄弟节点都没找到， 就向上遍历，找他父节点的兄弟节点，直到找到兄弟节点为止
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;
	findSibling: while (true) {
		//向上遍历
		while (node.sibling === null) {
			const parent = node.return;
			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null;
			}
			node = parent;
		}
		node.sibling.return = node.return;
		node = node.sibling;
		//说明直接sibling不是Host类型
		while (node.tag !== HostText && node.tag !== HostComponent) {
			//向下遍历
			if ((node.flags & Placement) !== NoFlags) {
				continue findSibling;
			}
			if (node.child === null) {
				continue findSibling;
			} else {
				node.child.return = node;
				node = node.child;
			}
		}
		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode;
		}
	}
}
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
		console.warn('未找到 hostparent', fiber);
	}
	return null;
}

function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	//fiber root
	// append 之前应该先确认下 finishedWork 是  HostComponent HostText 才可以 append
	// 因为对于需要append的tag类型不可能是HostRoot类型的，子 dom要是div 或者 直接是字符才可以append
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			insertChildToContainer(
				finishedWork.stateNode,
				hostParent,
				before as Instance
			);
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;
		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
