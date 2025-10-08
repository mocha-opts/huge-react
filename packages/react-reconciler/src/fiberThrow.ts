import { Wakeable } from 'shared/ReactTypes';
import { FiberRootNode } from './fiber';
import { ShouldCapture } from './fiberFlags';
import { Lane, markRootPinged } from './fiberLanes';
import { ensureRootIsScheduled, markRootUpdated } from './workLoop';
import { getSuspenseHandler } from './suspenseContext';

function attachPingListener(
	root: FiberRootNode,
	wakeable: Wakeable<any>,
	lane: Lane
) {
	//1.实现then的 ping方法
	//2.处理缓存，只处理第一次进入
	let pingCache = root.pingCache;
	// WeakMap{promise:Set<Lane>} 每一个Lane 就代表可以ping的Suspense
	let threadIDs: Set<Lane> | undefined;

	// WeakMap{ wakeable: Set[lane1, lane2, ...]}
	if (pingCache === null) {
		threadIDs = new Set<Lane>();
		pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
		pingCache.set(wakeable, threadIDs);
	} else {
		threadIDs = pingCache.get(wakeable);
		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>();
			pingCache.set(wakeable, threadIDs);
		}
	}
	if (!threadIDs.has(lane)) {
		// 第一次进入
		threadIDs.add(lane);

		function ping() {
			if (pingCache !== null) {
				pingCache.delete(wakeable);
			}
			markRootUpdated(root, lane);
			markRootPinged(root, lane);
			ensureRootIsScheduled(root);
		}
		wakeable.then(ping, ping);
	}
}

export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	// Error Boundray
	// thenable
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const weakable: Wakeable<any> = value;

		const suspenseBoundary = getSuspenseHandler();
		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture;
		}
		attachPingListener(root, weakable, lane);
	}
}
