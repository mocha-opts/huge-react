let syncQueue: ((...args: any) => void)[] | null = null;
let isFlushingSyncQueue = false;
export function scheduleSyncCallback(callback: (...args: any) => void) {
	if (syncQueue === null) {
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

export function flushSyncCallbacks() {
	if (!isFlushingSyncQueue && syncQueue) {
		isFlushingSyncQueue = true;

		try {
			syncQueue.forEach((cb) => cb());
		} catch (error) {
			if (__DEV__) {
				console.error('flushSyncCallbacks 发生错误', error);
			}
		} finally {
			isFlushingSyncQueue = false;
		}
	}
}
