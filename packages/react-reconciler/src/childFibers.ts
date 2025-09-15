import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

function ChildReconciler(shouldTrackEffects: boolean) {
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			//如果不用追踪副作用 直接return
			return;
		}
		//如果有副作用，deletions是父节点保存所有需要删除的子节点的数组
		const deletions = returnFiber.deletions;
		if (deletions === null) {
			//当前父节点还没有需要删除的子节点，那就把第一个子节点放入deletions
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion; //父节点要标记一个子节点需要删除
		} else {
			deletions.push(childToDelete);
		}
	}
	function deleteRemainingChildren(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		if (!shouldTrackEffects) {
			//如果不用追踪副作用 直接return
			return;
		}
		let childToDelete = currentFirstChild; //从第一个开始删除
		while (childToDelete !== null) {
			//遍历删除
			deleteChild(returnFiber, childToDelete);
			childToDelete = childToDelete.sibling;
		}
	}
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element?.key;
		while (currentFiber !== null) {
			if (currentFiber.key === key) {
				//key相同

				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						//type相同
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber; //更新父节点的指向
						// A1B2C3 -> A1 当前节点可复用，还得标记剩下节点删除
						deleteRemainingChildren(returnFiber, currentFiber.sibling);
						return existing;
					}
					//key 相同 type不同 不能复用 A1B2C3 -> C1A2B3
					//删掉所有旧的
					deleteRemainingChildren(returnFiber, currentFiber);
					break;
				} else {
					if (__DEV__) {
						console.warn('未实现的react类型', element);
						break;
					}
				}
			} else {
				//key不同
				//删掉旧的
				deleteChild(returnFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		}
		//根据element创建一个fiber
		const fiber = createFiberFromElement(element);
		fiber.return = returnFiber;
		return fiber;
	}
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		while (currentFiber !== null) {
			//update
			if (currentFiber.tag === HostText) {
				//类型没变 可以复用
				const existing = useFiber(currentFiber, { content }); //props是包含了content字段的props
				existing.return = returnFiber;
				deleteRemainingChildren(returnFiber, currentFiber.sibling);
				return existing;
			}
			//不同
			deleteChild(returnFiber, currentFiber);
			currentFiber = currentFiber.sibling;
		}
		//然后进入创建新的hostText的流程
		//根据element创建一个fiber
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}
	function placeSingleChild(fiber: FiberNode) {
		//首屏渲染的时候，应该追踪副作用的时候才标记placement
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement;
		}
		return fiber;
	}

	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		//判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					return placeSingleChild(
						reconcileSingleElement(returnFiber, currentFiber, newChild)
					);
				default:
					if (__DEV__) {
						console.warn('未实现的reconcile类型', newChild);
					}
					break;
			}
		}
		//TODO 多节点的情况 ul> li *3

		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}
		// 兜底删除
		if (currentFiber !== null) {
			deleteChild(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		// return fiberNode
		return null;
	};
}

function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}
export const reconcileChildFibers = ChildReconciler(true);

export const mountChildFibers = ChildReconciler(false);
