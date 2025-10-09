import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import { Fragment, HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

type ExistingChildren = Map<string | number, FiberNode>;
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
						let props = element.props;
						if (element.type === REACT_FRAGMENT_TYPE) {
							//对于Fragment类型 直接取children
							props = element.props.children;
						}
						//type相同
						const existing = useFiber(currentFiber, props);
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
		let fiber = createFiberFromElement(element);

		if (element.type === REACT_FRAGMENT_TYPE) {
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}
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
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		let lastPlacedIndex = 0; //最后一个可复用的fiber在current中的index
		let lastNewFiber: FiberNode | null = null; //创建的最后一个fiber
		let firstNewFiber: FiberNode | null = null; //创建的第一个fiber

		// 1.将current的子节点们放到一个map中，key为key或者index，value为fiber
		const existingChildren: ExistingChildren = new Map();
		// current单向链表 通过.sibling访问下一个节点,每个节点是FiberNode
		// newChild是一个数组 通过索引访问下一个节点 [A1, B1, C1] 每一个元素都是ReactElement
		let current = currentFirstChild;
		while (current !== null) {
			//current可能没有key 有key就用key 没有就用index索引位置
			//key相同的前提下 type相同才能复用
			//A1B2C3 -> B1C1A3
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		// 2.遍历newChild 对比currentFiber 如果能找到就复用，不能找到就创建新的fiber
		for (let i = 0; i < newChild.length; i++) {
			const after = newChild[i]; //ReactElement
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);
			// 不管之前是什么节点 更新后 为xxxx-> false null undefined 0 '' 都是没意义的节点
			// 兜底删除
			if (newFiber === null) {
				continue;
			}
			// 3.标记移动还是插入
			//「移动」具体是指「向右移动」
			// 移动的判断依据：element的index与「element对应current fiber」的index的比较
			// A1 B2 C3 -> B2 C3 A1
			// 0__1__2______0__1__2
			// 当遍历element时，「当前遍历到的element」一定是「所有已遍历的element」中最靠右那个。
			// 所以只需要记录「最后一个可复用fiber」在current中的index（lastPlacedIndex），在接下来的遍历中：
			// 如果接下来遍历到的「可复用fiber」的index < lastPlacedIndex，则标记Placement
			// 否则，不标记
			newFiber.index = i; //更新fiber的index
			newFiber.return = returnFiber;
			if (lastNewFiber === null) {
				//说明是第一个节点
				firstNewFiber = newFiber;
				lastNewFiber = newFiber;
			} else {
				//不是第一个节点
				lastNewFiber.sibling = newFiber;
				lastNewFiber = lastNewFiber.sibling;
			}
			if (!shouldTrackEffects) {
				//如果不需要追踪副作用 直接进入下一个循环
				continue;
			}
			const current = newFiber.alternate; //能复用的fiber
			if (current !== null) {
				//能复用
				const oldIndex = current.index;
				if (oldIndex < lastPlacedIndex) {
					//需要移动
					newFiber.flags |= Placement;
					continue;
				} else {
					//不需要移动 更新lastPlacedIndex
					lastPlacedIndex = oldIndex;
				}
			} else {
				//mount
				//没有可复用的节点 肯定是插入
				newFiber.flags |= Placement;
			}
		}
		// 4.将Map中剩下的节点删除
		existingChildren.forEach((fiber) => deleteChild(returnFiber, fiber));

		return firstNewFiber;
	}

	function getElementKeyToUse(element: any, index?: number): Key {
		if (
			Array.isArray(element) ||
			typeof element === 'string' ||
			typeof element === 'number' ||
			element === null ||
			element === undefined
		) {
			return index;
		}
		return element.key !== null ? element.key : index;
	}

	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		const keyToUse = getElementKeyToUse(element, index);
		const before = existingChildren.get(keyToUse); //更新前的fiber节点
		//
		//1.element是HostText的情况
		if (typeof element === 'string' || typeof element === 'number') {
			//文本节点
			if (before) {
				if (before?.tag === HostText) {
					//类型也相同 可以复用
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}

			//创建新的
			const fiber = new FiberNode(HostText, { content: element + '' }, null);
			return fiber;
		}
		//2.ReactElement
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					if (element.type === REACT_FRAGMENT_TYPE) {
						// 最终创建一个fiber tag 是Fragment类型 进入beginWork也需要处理
						return updateFragment(
							returnFiber,
							before,
							element,
							keyToUse,
							existingChildren
						);
					}
					//普通的函数组件和类组件
					if (before) {
						//找到了更新前的fiber节点
						if (before.type === element.type) {
							//类型相同 可以复用
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					//不能复用就返回新的 创建新的
					const fiber = createFiberFromElement(element);
					return fiber;
				//TODO 其他内置组件

				default:
			}
		}
		if (Array.isArray(element)) {
			return updateFragment(
				returnFiber,
				before,
				element,
				keyToUse,
				existingChildren
			);
		}
		return null;
	}

	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: any
	) {
		//判断Fragment
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			//<>
			//<div>A</div>
			// <div>B</div>
			// </>
			//jsxs(Fragment,{children:[jsx("div",{children:"A"}),jsx("div",{children:"B"})]})
			newChild = newChild?.props.children;
		}
		//判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// 多节点的情况 ul> li *3
			if (Array.isArray(newChild)) {
				return reconcileChildrenArray(returnFiber, currentFiber, newChild);
			}
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

		//文本节点 1234 '1234'  true  false  null  undefined
		//如果是数字或者字符串 创建一个文本节点的fiber
		// HostComponent
		// HostRoot
		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}
		// 兜底删除
		if (currentFiber !== null) {
			deleteRemainingChildren(returnFiber, currentFiber);
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

function updateFragment(
	returnFiber: FiberNode,
	current: FiberNode | undefined,
	elements: any[],
	key: Key,
	existingChildren: ExistingChildren
) {
	let fiber;
	if (!current || current.tag !== Fragment) {
		fiber = createFiberFromFragment(elements, key);
	} else {
		existingChildren.delete(key);
		fiber = useFiber(current, elements);
	}
	fiber.return = returnFiber;
	return fiber;
}
export const reconcileChildFibers = ChildReconciler(true);

export const mountChildFibers = ChildReconciler(false);

export function cloneChildFibers(wip: FiberNode) {
	//child sibling
	if (wip.child === null) {
		return;
	}
	let currentChild = wip.child;
	let newChild = createWorkInProgress(currentChild, currentChild.pendingProps);
	wip.child = newChild;
	newChild.return = wip;

	while (currentChild.sibling !== null) {
		currentChild = currentChild.sibling;
		newChild = newChild.sibling = createWorkInProgress(
			newChild,
			newChild.pendingProps
		);
		newChild.return = wip;
	}
}
