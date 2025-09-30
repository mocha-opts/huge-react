export type Flags = number;
export const NoFlags = 0b0000000000000000000;
export const Placement = 0b0000000000000000001;
export const Update = 0b0000000000000000010;
export const ChildDeletion = 0b0000000000000000100;
//UseEffect
export const PassiveEffect = 0b0000000000000001000;
export const Ref = 0b0000000000000010000;
export const MutationMask = Placement | Update | ChildDeletion | Ref;
export const LayoutMask = Ref;

//删除子节点可能触发useEffect destroy
export const PassiveMask = PassiveEffect | ChildDeletion;
