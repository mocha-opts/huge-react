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

	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element?.key;
		work: if (currentFiber !== null) {
			//key相同
			if (key === currentFiber.key) {
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					//type相同
					if (element.type === currentFiber.type) {
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber; //更新父节点的指向
						return existing;
					}
					//type不同
					deleteChild(returnFiber, currentFiber);
					break work;
				} else {
					if (__DEV__) {
						console.warn('未实现的react类型', element);
						break work;
					}
				}
			} else {
				//key不同
				//删掉旧的
				deleteChild(returnFiber, currentFiber);
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
		if (currentFiber !== null) {
			//类型相同
			if (currentFiber.tag === HostText) {
				const existing = useFiber(currentFiber, { content }); //props是包含了content字段的props
				existing.return = returnFiber;
				return existing;
			}
			//不同
			deleteChild(returnFiber, currentFiber);
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
