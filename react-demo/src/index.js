import React from 'react';
import ReactDOM from 'react-dom';
// const jsx = (
// 	<div>
// 		<span>big-react</span>
// 	</div>
// );

function App() {
	return (
		<div>
			<Children></Children>
		</div>
	);
}
function Children() {
	return <div>children</div>;
}

const jsx = <App />;

const root = document.querySelector('#root');
ReactDOM.createRoot(root).render(<App></App>);
console.log(React);

console.log(jsx);

console.log(ReactDOM);
