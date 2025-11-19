// Source:
// window.op = window.op || (function() {
//   var q = [];
//   var op = new Proxy(function() {
//     if (arguments.length > 0) {
//       q.push(Array.prototype.slice.call(arguments));
//     }
//   }, {
//     get: function(_, prop) {
//       if (prop === 'q') {
//         return q;
//       }
//       return function() {
//         q.push([prop].concat(Array.prototype.slice.call(arguments)));
//       };
//     }
//   });
//   return op;
// })();

export function getInitSnippet(): string {
  return `window.op=window.op||function(){var n=[],o=new Proxy((function(){arguments.length>0&&n.push(Array.prototype.slice.call(arguments))}),{get:function(o,t){return"q"===t?n:function(){n.push([t].concat(Array.prototype.slice.call(arguments)))}}});return o}();`;
}
