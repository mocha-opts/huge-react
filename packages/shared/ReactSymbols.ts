const supportSymbol = typeof Symbol === 'function' && Symbol.for;

export const REACT_ELEMENT_TYPE = supportSymbol
	? Symbol.for('react.element')
	: 0xeac7;

//ReactElement的type
export const REACT_FRAGMENT_TYPE = supportSymbol
	? Symbol.for('react.fragment')
	: 0xeaca;

export const REACT_CONTEXT_TYPE = supportSymbol
	? Symbol.for('react.context')
	: 0xeacc;

export const REACT_PROVIDER_TYPE = supportSymbol
	? Symbol.for('react.provider')
	: 0xeac2;

export const REACT_SUSPENSE_TYPE = supportSymbol
	? Symbol.for('react.suspense')
	: 0xeac1;

export const REACT_OFFSCREEN_TYPE = supportSymbol
	? Symbol.for('react.offscreen')
	: 0xeac4;

export const REACT_LEGACY_HIDDEN_TYPE = supportSymbol
	? Symbol.for('react.legacy_hidden')
	: 0xeac5;

export const REACT_LAZY_TYPE = supportSymbol
	? Symbol.for('react.lazy')
	: 0xeac6;

export const REACT_MEMO_TYPE = supportSymbol
	? Symbol.for('react.memo')
	: 0xeac3;
