export type Type = any;
export type Key = any;
export type Ref = any;
export type Props = any;
export type ElementType = any;

export interface ReactElementType {
	$$typepf: symbol | number;
	type: ElementType;
	ref: Ref;
	key: Key;
	props: Props;
	__mark: string;
}

export type Action<State> = State | ((prevState: State) => State);
