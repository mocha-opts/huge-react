# huge-react

my step of learning react source code

1.createRoot
调用 react-reconciler 中的 createContainer 方法：创建应用的根节点 FiberRootNode，并将 FIberROotNode 和 hostRootFiber 连接起来
2.render
3.updateContainer
4.createFiberRoot
5.createHostRootFiber
6.updateContainer
7.scheduleUpdateOnFiber
8.enqueueUpdate
9.performSyncWorkOnRoot
10.renderRootSync
11.prepareFreshStack
12.workLoopSync
13.performUnitOfWork
14.beginWork
15.updateHostRoot
16.updateHostComponent
17.reconcileChildren
18.reconcileChildFibers
19.placeSingleChild
20.completeUnitOfWork (beginWork 的逆向过程)
21.completeWork
22.appendAllChildren
23.appendInitialChild
24.createInstance
25.finalizeInitialChildren
26.appendChildToContainer
27.commitRoot
28.commitMutationEffects
29.commitMutationEffectsOnFiber
30.commitPlacement
31.commitLayoutEffects
32.commitLayoutEffectOnFiber
33.callCallback
34.flushPassiveEffects
35.commitRootImpl
36.layoutEffectMountInDEV
