import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_runWithPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { Props } from 'shared/ReactTypes';

export const elementPropKey = '__props';

const validEventTypeList = ['click'];

type EventCallback = (e: Event) => void;

interface SyntheticEvent extends Event {
	//实现阻止冒泡
	__stopPropagation: boolean;
}

type PathType = 'capture' | 'bubble';

interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}
export interface DOMElement extends Element {
	[elementPropKey]: Props;
}

//dom[xxx] = reactElement props
export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropKey] = props;
}

export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn(`当前不支持${eventType}事件`);
		return;
	}
	if (__DEV__) {
		console.log('初始化事件：', eventType);
	}
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

//传入dom的原始事件，返回合成事件
function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	const originStopPropagation = e.stopPropagation;

	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation();
		}
	};
	return syntheticEvent;
}

function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;
	if (targetElement === null) {
		console.warn('事件不存在target', e);
		return;
	}
	//1. 收集沿途事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	//2.构造合成事件
	const se = createSyntheticEvent(e);
	//3.遍历capture
	triggerEventFlow(capture, se);
	if (!se.__stopPropagation) {
		//4.遍历bubble
		triggerEventFlow(bubble, se);
	}
}

function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		unstable_runWithPriority(eventTypeToSchedulerpriority(se.type), () => {
			callback.call(null, se);
		});
		if (se.__stopPropagation) {
			break;
		}
	}
}
function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return { click: ['onClickCapture', 'onClick'] }[eventType];
}

function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	while (targetElement && targetElement !== container) {
		//收集
		const elementProps = targetElement[elementPropKey];
		if (elementProps) {
			//click -> onClick onClickCapture
			const callbackNameList = getEventCallbackNameFromEventType(eventType);
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i === 0) {
							//capture
							paths.capture.unshift(eventCallback);
						} else {
							paths.bubble.push(eventCallback);
						}
					}
				});
				// div2 onClick onClickCapture
				//   div1 onClick onClickCapture
				//     p targetElement onClick

				// bubble [p onClick div1 onClick div2 onClick] 从下往上
				// capture[div2 onCLickCapture div1 onClickCapture] 从上往下
			}
		}
		targetElement = targetElement.parentNode as DOMElement;
	}
	return paths;
}

function eventTypeToSchedulerpriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
