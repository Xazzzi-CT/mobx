import {
    observable, computed, transaction, autorun, extendObservable, action,
	isObservableObject, observe, isObservable, spy, isAction, useStrict
} from "../";
import * as mobx from "../"

var test = require('tape')

class Box {
    @observable uninitialized;
    @observable height = 20;
    @observable sizes = [2];
    @observable someFunc = function () { return 2; };
    @computed get width() {
        return this.height * this.sizes.length * this.someFunc() * (this.uninitialized ? 2 : 1);
    }
}

var box = new Box();

var ar = []

autorun(() => {
    ar.push(box.width);
});


test('babel', function (t) {
  var s = ar.slice()
  t.deepEqual(s, [40])
  box.height = 10
  s = ar.slice()
  t.deepEqual(s, [40, 20])
  box.sizes.push(3, 4)
  s = ar.slice()
  t.deepEqual(s, [40, 20, 60])
  box.someFunc = () => 7
  s = ar.slice()
  t.deepEqual(s, [40, 20, 60, 210])
  box.uninitialized = true
  s = ar.slice()
  t.deepEqual(s, [40, 20, 60, 210, 420])
  t.end()
})

test('babel: parameterized computed decorator', (t) => {
	class TestClass {
		@observable x = 3;
		@observable y = 3;
		@computed.struct get boxedSum() {
			return { sum: Math.round(this.x) + Math.round(this.y) };
		}
	}

	const t1 = new TestClass();
	const changes: { sum: number}[] = [];
	const d = autorun(() => changes.push(t1.boxedSum));

	t1.y = 4; // change
	t.equal(changes.length, 2);
	t1.y = 4.2; // no change
	t.equal(changes.length, 2);
	transaction(() => {
		t1.y = 3;
		t1.x = 4;
	}); // no change
	t.equal(changes.length, 2);
	t1.x = 6; // change
	t.equal(changes.length, 3);
	d();

	t.deepEqual(changes, [{ sum: 6 }, { sum: 7 }, { sum: 9 }]);

	t.end();
});

class Order {
    @observable price = 3;
    @observable amount = 2;
    @observable orders = [];
    @observable aFunction = function(a) { };

    @computed get total() {
        return this.amount * this.price * (1 + this.orders.length);
    }
}

test('decorators', function(t) {
	var o = new Order();
	t.equal(isObservableObject(o), true);
	t.equal(isObservable(o, 'amount'), true);
	t.equal(o.total, 6); // .... this is required to initialize the props which are made reactive lazily...
	t.equal(isObservable(o, 'total'), true);

	var events = [];
	var d1 = observe(o, (ev) => events.push(ev.name, ev.oldValue));
	var d2 = observe(o, 'price', (ev) => events.push(ev.newValue, ev.oldValue));
	var d3 = observe(o, 'total', (ev) => events.push(ev.newValue, ev.oldValue));

	o.price = 4;

	d1();
	d2();
	d3();

	o.price = 5;

	t.deepEqual(events, [
		8, // new total
		6, // old total
		4, // new price
		3, // old price
		"price", // event name
		3, // event oldValue
	]);

	t.end();
})

test('issue 191 - shared initializers (babel)', function(t) {
	class Test {
		@observable obj = { a: 1 };
		@observable array = [2];
	}

	var t1 = new Test();
	t1.obj.a = 2;
	t1.array.push(3);

	var t2 = new Test();
	t2.obj.a = 3;
	t2.array.push(4);

	t.notEqual(t1.obj, t2.obj);
	t.notEqual(t1.array, t2.array);
	t.equal(t1.obj.a, 2);
	t.equal(t2.obj.a, 3);

	t.deepEqual(t1.array.slice(), [2,3]);
	t.deepEqual(t2.array.slice(), [2,4]);

	t.end();
})

test("705 - setter undoing caching (babel)", t => {
	let recomputes = 0;
	let autoruns = 0;

	class Person {
		@observable name: string;
		@observable title: string;
		set fullName(val) {
			// Noop
		}
		@computed get fullName() {
			debugger;
			recomputes++;
			return this.title+" "+this.name;
		}
	}

	let p1 = new Person();
	p1.name="Tom Tank";
	p1.title="Mr.";

	t.equal(recomputes, 0);
	t.equal(autoruns, 0);

	const d1 = autorun(()=> {
		autoruns++;
		p1.fullName;
	})

	const d2 = autorun(()=> {
		autoruns++;
		p1.fullName;
	})

	t.equal(recomputes, 1);
	t.equal(autoruns, 2);

	p1.title="Master";
	t.equal(recomputes, 2);
	t.equal(autoruns, 4);

	d1();
	d2();
	t.end();
})

function normalizeSpyEvents(events) {
	events.forEach(ev => {
		delete ev.fn;
		delete ev.time;
	});
	return events;
}

test("action decorator (babel)", function(t) {
	class Store {
		constructor(multiplier) {
			this.multiplier = multiplier;
		}

		@action
		add(a, b) {
			return (a + b) * this.multiplier;
		}
	}

	const store1 =  new Store(2);
	const store2 =  new Store(3);
	const events: any[] = [];
	const d = spy(events.push.bind(events));
	t.equal(store1.add(3, 4), 14);
	t.equal(store2.add(3, 4), 21);
	t.equal(store1.add(1, 1), 4);

	t.deepEqual(normalizeSpyEvents(events),	[
		{ arguments: [ 3, 4 ], name: "add", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 3, 4 ], name: "add", spyReportStart: true, object: store2, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 1, 1 ], name: "add", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true }
	]);

	d();
	t.end();
});

test("custom action decorator (babel)", function(t) {
	class Store {
		constructor(multiplier) {
			this.multiplier = multiplier;
		}

		@action("zoem zoem")
		add(a, b) {
			return (a + b) * this.multiplier;
		}
	}

	const store1 =  new Store(2);
	const store2 =  new Store(3);
	const events: any[] = [];
	const d = spy(events.push.bind(events));
	t.equal(store1.add(3, 4), 14);
	t.equal(store2.add(3, 4), 21);
	t.equal(store1.add(1, 1), 4);

	t.deepEqual(normalizeSpyEvents(events),	[
		{ arguments: [ 3, 4 ], name: "zoem zoem", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 3, 4 ], name: "zoem zoem", spyReportStart: true, object: store2, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 1, 1 ], name: "zoem zoem", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true },
	]);

	d();
	t.end();
});


test("action decorator on field (babel)", function(t) {
	class Store {
		constructor(multiplier) {
			this.multiplier = multiplier;
		}


		@action
		add = (a, b) => {
			return (a + b) * this.multiplier;
		};
	}

	const store1 =  new Store(2);
	const store2 =  new Store(7);

	const events: any[] = [];
	const d = spy(events.push.bind(events));
	t.equal(store1.add(3, 4), 14);
	t.equal(store2.add(5, 4), 63);
	t.equal(store1.add(2, 2), 8);

	t.deepEqual(normalizeSpyEvents(events),	[
		{ arguments: [ 3, 4 ], name: "add", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 5, 4 ], name: "add", spyReportStart: true, object: store2, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 2, 2 ], name: "add", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true }
	]);

	d();
	t.end();
});

test("custom action decorator on field (babel)", function(t) {
	class Store {
		constructor(multiplier) {
			this.multiplier = multiplier;
		}


		@action("zoem zoem")
		add = (a, b) => {
			return (a + b) * this.multiplier;
		};
	}

	const store1 =  new Store(2);
	const store2 =  new Store(7);

	const events: any[] = [];
	const d = spy(events.push.bind(events));
	t.equal(store1.add(3, 4), 14);
	t.equal(store2.add(5, 4), 63);
	t.equal(store1.add(2, 2), 8);

	t.deepEqual(normalizeSpyEvents(events),	[
		{ arguments: [ 3, 4 ], name: "zoem zoem", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 5, 4 ], name: "zoem zoem", spyReportStart: true, object: store2, type: "action" },
		{ spyReportEnd: true },
		{ arguments: [ 2, 2 ], name: "zoem zoem", spyReportStart: true, object: store1, type: "action" },
		{ spyReportEnd: true }
	]);

	d();
	t.end();
});

test("267 (babel) should be possible to declare properties observable outside strict mode", t => {
	useStrict(true);

	class Store {
		@observable timer;
	}

	useStrict(false);
	t.end();
})

test("288 atom not detected for object property", t => {
	class Store {
		@mobx.observable foo = '';
	}

	const store = new Store();

	mobx.observe(store, 'foo', () => {
		console.log('Change observed');
	}, true);

	t.end()
})

test("observable performance", t => {
	const AMOUNT = 100000;

	class A {
		@observable a = 1;
		@observable b = 2;
		@observable c = 3;
		@computed get d() {
			return this.a + this.b + this.c;
		}
	}

	const objs = [];
	const start = Date.now();

	for (var i = 0; i < AMOUNT; i++)
		objs.push(new A());

	console.log("created in ", Date.now() - start);

	for (var j = 0; j < 4; j++) {
		for (var i = 0; i < AMOUNT; i++) {
			const obj = objs[i]
			obj.a += 3;
			obj.b *= 4;
			obj.c = obj.b - obj.a;
			obj.d;
		}
	}

	console.log("changed in ", Date.now() - start);

	t.end();
})

test("unbound methods", t => {
	class A {
		// shared across all instances
		@action m1() {

		}

		// per instance
		@action m2 = () => {};
	}

	const a1 = new A();
	const a2 = new A();

	t.equal(a1.m1, a2.m1);
	t.notEqual(a1.m2, a2.m2);
	t.equal(a1.hasOwnProperty("m1"), false);
	t.equal(a1.hasOwnProperty("m2"), true);
	t.equal(a2.hasOwnProperty("m1"), false);
	t.equal(a2.hasOwnProperty("m2"), true);
	t.end();

})

test("inheritance", t => {
	class A {
		@observable a = 2;
	}

	class B extends A {
		@observable b = 3;
		@computed get c() {
			return this.a + this.b;
		}
	}

	const b1 = new B();
	const b2 = new B();
	const values = []
	mobx.autorun(() => values.push(b1.c + b2.c));

	b1.a = 3;
	b1.b = 4;
	b2.b = 5;
	b2.a = 6;

	t.deepEqual(values, [
		10,
		11,
		12,
		14,
		18
	])

	t.end();
})

test("inheritance overrides observable", t => {
	class A {
		@observable a = 2;
	}

	class B {
		@observable a = 5;
		@observable b = 3;
		@computed get c() {
			return this.a + this.b;
		}
	}

	const b1 = new B();
	const b2 = new B();
	const values = []
	mobx.autorun(() => values.push(b1.c + b2.c));

	b1.a = 3;
	b1.b = 4;
	b2.b = 5;
	b2.a = 6;

	t.deepEqual(values, [
		16,
		14,
		15,
		17,
		18
	])

	t.end();
})

test("reusing initializers", t => {
	class A {
		@observable a = 3;
		@observable b = this.a + 2;
		@computed get c() {
			return this.a + this.b;
		}
		@computed get d() {
			return this.c + 1;
		}
	}

	const a = new A();
	const values = [];
	mobx.autorun(() => values.push(a.d));

	a.a = 4;
	t.deepEqual(values, [
		9,
		10
	])

	t.end();
})

test("enumerability", t => {
	class A {
		@observable a = 1; // enumerable, on proto
		@observable a2 = 2;
		@computed get b () { return this.a } // non-enumerable, on proto
		@action m() {} // non-enumerable, on proto
		@action m2 = () => {}; // non-enumerable, on self
	}

	const a = new A();

	// not initialized yet
	let ownProps = Object.keys(a);
	let props = [];
	for (var key in a)
		props.push(key);

	t.deepEqual(ownProps, [
		// should have a, not supported yet in babel...
	]);

	t.deepEqual(props, [
		"a",
		"a2"
	]);

	t.equal("a" in a, true);
	t.equal(a.hasOwnProperty("a"), false); // true would better..
	t.equal(a.hasOwnProperty("b"), false);
	t.equal(a.hasOwnProperty("m"), false);
	t.equal(a.hasOwnProperty("m2"), false); // true would be ok as well

	t.equal(mobx.isAction(a.m), true);
	t.equal(mobx.isAction(a.m2), true);

	// after initialization
	a.a;
	a.b;
	a.m;
	a.m2;

	ownProps = Object.keys(a);
	props = [];
	for (var key in a)
		props.push(key);

	t.deepEqual(ownProps, [
		"a",
		"a2" // a2 is now initialized as well, altough never accessed!
	]);

	t.deepEqual(props, [
		"a",
		"a2"
	]);

	t.equal("a" in a, true);
	t.equal(a.hasOwnProperty("a"), true);
	t.equal(a.hasOwnProperty("a2"), true);
	t.equal(a.hasOwnProperty("b"), false);
	t.equal(a.hasOwnProperty("m"), false);
	t.equal(a.hasOwnProperty("m2"), true);


	t.end();
})

test("enumerability - workaround", t => {
	class A {
		@observable a = 1; // enumerable, on proto
		@observable a2 = 2;
		@computed get b () { return this.a } // non-enumerable, on proto
		@action m() {} // non-enumerable, on proto
		@action m2 = () => {}; // non-enumerable, on self

		constructor() {
			this.a = 1
			this.a2 = 2
		}
	}

	const a = new A();

	const ownProps = Object.keys(a);
	const props = [];
	for (var key in a)
		props.push(key);

	t.deepEqual(ownProps, [
		"a",
		"a2" // a2 is now initialized as well, altough never accessed!
	]);

	t.deepEqual(props, [
		"a",
		"a2"
	]);

	t.equal("a" in a, true);
	t.equal(a.hasOwnProperty("a"), true);
	t.equal(a.hasOwnProperty("a2"), true);
	t.equal(a.hasOwnProperty("b"), false);
	t.equal(a.hasOwnProperty("m"), false);
	t.equal(a.hasOwnProperty("m2"), true);


	t.end();
})

test("issue 285 (babel)", t => {
	const {observable, toJS} = mobx;

	class Todo {
		id = 1;
		@observable title;
		@observable finished = false;
		@observable childThings = [1,2,3];
		constructor(title) {
			this.title = title;
		}
	}

	var todo = new Todo("Something to do");

	t.deepEqual(toJS(todo), {
		id: 1,
		title: "Something to do",
		finished: false,
		childThings: [1,2,3]
	})

	t.end();
})

test("verify object assign (babel)", t => {
	class Todo {
		@observable title = "test";
		@computed get upperCase() {
			return this.title.toUpperCase()
		}
	}

	const todo = new Todo();
	t.deepEqual(Object.assign({}, todo), {
//		Should be:	title: "test"!
	});

	todo.title; // lazy initialization :'(

	t.deepEqual(Object.assign({}, todo), {
		title: "test"
	});

	t.end();
})


test("379, inheritable actions (babel)", t => {
	class A {
		@action method() {
			return 42;
		}
	}

	class B extends A {
		@action method() {
			return super.method() * 2
		}
	}

	class C extends B {
		@action method() {
			return super.method() + 3
		}
	}

	const b = new B()
	t.equal(b.method(), 84)
	t.equal(isAction(b.method), true)

	const a = new A()
	t.equal(a.method(), 42)
	t.equal(isAction(a.method), true)

	const c = new C()
	t.equal(c.method(), 87)
	t.equal(isAction(c.method), true)

	t.end()
})

test("379, inheritable actions - 2 (babel)", t => {
	class A {
		@action("a method") method() {
			return 42;
		}
	}

	class B extends A {
		@action("b method") method() {
			return super.method() * 2
		}
	}

	class C extends B {
		@action("c method") method() {
			return super.method() + 3
		}
	}

	const b = new B()
	t.equal(b.method(), 84)
	t.equal(isAction(b.method), true)

	const a = new A()
	t.equal(a.method(), 42)
	t.equal(isAction(a.method), true)

	const c = new C()
	t.equal(c.method(), 87)
	t.equal(isAction(c.method), true)

	t.end()
})

test("505, don't throw when accessing subclass fields in super constructor (babel)", t => {
	const values = {}
	class A {
		@observable a = 1
		constructor() {
			values.b = this.b
			values.a = this.a
		}
	}

	class B extends A {
		@observable b = 2
	}

	new B()
	t.deepEqual(values, { a: 1, b: 2}) // In the TS test b is undefined, which is actually the expected behavior?
	t.end()
})

test('computed setter should succeed (babel)', function(t) {
	class Bla {
		@observable a = 3;
		@computed get propX() {
			return this.a * 2;
		}
		set propX(v) {
			this.a = v
		}
	}

	const b = new Bla();
	t.equal(b.propX, 6);
	b.propX = 4;
	t.equal(b.propX, 8);

	t.end();
});

test('computed getter / setter for plan objects should succeed (babel)', function(t) {
	const b = observable({
		a: 3,
		get propX() { return this.a * 2 },
		set propX(v) { this.a = v }
	})

	const values = []
	mobx.autorun(() => values.push(b.propX))
	t.equal(b.propX, 6);
	b.propX = 4;
	t.equal(b.propX, 8);

	t.deepEqual(values, [6, 8])

	t.end();
});

test('issue #701', t => {

	class Model {
	@observable a = 5
	}

	const model = new Model()

	t.deepEqual(mobx.toJS(model), { a: 5 })
	t.equal(mobx.isObservable(model), true);
	t.equal(mobx.isObservableObject(model), true);

	t.end()
})


test("@observable.ref (Babel)", t => {
	class A {
		@observable.ref ref = { a: 3}
	}

	const a = new A();
	t.equal(a.ref.a, 3);
	t.equal(mobx.isObservable(a.ref), false);
	t.equal(mobx.isObservable(a, "ref"), true);

	t.end();
})

test("@observable.shallow (Babel)", t => {
	class A {
		@observable.shallow arr = [{ todo: 1 }]
	}

	const a = new A();
	const todo2 = { todo: 2 };
	a.arr.push(todo2)
	t.equal(mobx.isObservable(a.arr), true);
	t.equal(mobx.isObservable(a, "arr"), true);
	t.equal(mobx.isObservable(a.arr[0]), false);
	t.equal(mobx.isObservable(a.arr[1]), false);
	t.ok(a.arr[1] === todo2)

	t.end();
})


test("@observable.deep (Babel)", t => {
	class A {
		@observable.deep arr = [{ todo: 1 }]
	}

	const a = new A();
	const todo2 = { todo: 2 };
	a.arr.push(todo2)

	t.equal(mobx.isObservable(a.arr), true);
	t.equal(mobx.isObservable(a, "arr"), true);
	t.equal(mobx.isObservable(a.arr[0]), true);
	t.equal(mobx.isObservable(a.arr[1]), true);
	t.ok(a.arr[1] !== todo2)
	t.equal(isObservable(todo2), false);

	t.end();
})

test("action.bound binds (Babel)", t=> {
	class A {
		@observable x = 0;
		@action.bound
		inc(value: number) {
			this.x += value;
		}
	}

	const a = new A();
	const runner = a.inc;
	runner(2);

	t.equal(a.x, 2);

	t.end();
})

test("@computed.equals (Babel)", t => {
	const sameTime = (from, to) => from.hour === to.hour && from.minute === to.minute;
	class Time {
		constructor(hour, minute) {
			this.hour = hour;
			this.minute = minute;
		}

		@observable hour: number;
		@observable minute: number;

		@computed.equals(sameTime) get time() {
			return { hour: this.hour, minute: this.minute };
		}
	}
	const time = new Time(9, 0);

	const changes = [];
	const disposeAutorun = autorun(() => changes.push(time.time));

	t.deepEqual(changes, [ { hour: 9, minute: 0 }]);
	time.hour = 9;
	t.deepEqual(changes, [ { hour: 9, minute: 0 }]);
	time.minute = 0;
	t.deepEqual(changes, [ { hour: 9, minute: 0 }]);
	time.hour = 10;
	t.deepEqual(changes, [ { hour: 9, minute: 0 }, { hour: 10, minute: 0 }]);
	time.minute = 30;
	t.deepEqual(changes, [ { hour: 9, minute: 0 }, { hour: 10, minute: 0 }, { hour: 10, minute: 30 }]);

	disposeAutorun();

	t.end();
});