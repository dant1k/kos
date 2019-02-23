# KOS Reaction

## Reacting to multiple events

It is often difficult to express logic that involves processing of
events generated by different components.

Let's consider a contrived example where there are two event emitters:

```javascript

const Emitter = require('events').EventEmitter;
const { Reaction } = require('kos');

const emitterA = new Emitter();
const emitterB = new Emitter();

// define a new KOS reaction
const reaction1 = new Reaction({
  consumes: [ 'event1', 'event2' ],
  produces: [ 'result1' ],
  async trigger(e1, e2) {
    // do something with e1 and e2
    await this.after(1000); // emulate 1 second processing time
    this.send('result1', e1 + e2);
  },
});

emitterA.on('data', (data) => { reaction1.feed('event1', data); });
emitterB.on('data', (data) => { reaction1.feed('event2', data); });

reaction1.on('data', console.log); // for now, just see what we get...

//
// fire the events that will trigger the reaction
//
emitterA.emit('data', 10);

// fire emitterB 1 second later
setTimeout(() => emitterB.emit('data', 20), 1000); 

```

That was pretty simple. Let's chain the reactions and make things a
bit more interesting. 

NOTE: We'll continue as if we're working inside Node.js REPL and the
above code is already loaded.

## Chaining Reactions

It is useful to build a data pipeline so that results from prior
reactions can be used in subsequent reactions.

```javascript

const emitterC = new Emitter();

const reaction2 = new Reaction({
  consumes: [ 'result1', 'event3' ],
  produces: [ 'result2', 'result3' ],
  async trigger(r1, e3) {
    // just another addition of result1 + event3
    this.send('result2', r1 + e3);
    await this.after(1000); // emulate 1 second processing time
    this.send('result3', { a: 'object', b: (r1 - e3), c: e3 });
  },
});

reaction2.on('data', console.log); // for now, just see what we get...
emitterC.on('foo', (foo) => { reaction2.feed('event3', foo); });

reaction1.link(reaction2); // here's the magic chain

//
// fire the events that will trigger the reactions
//
emitterA.emit('data', 10); // event1
emitterB.emit('data', 20); // event2
emitterC.emit('foo', 5);   // event3

```

Here play around a bit inside the REPL with what happens when you emit
various events.

## Closed-loop Reactions

Here we enter a somewhat *dangerous* territory of a data feedback
loop. Basically, an infinite reaction chain loop that uses the output
of a reaction back to a reaction that can trigger the chain over and
over again.

```javascript

// the feedback reaction
const reaction3 = new Reaction({
  consumes: [ 'result1', 'result3 ],
  produces: [ 'event3, ],
  async trigger(r1, r3) {
    if (r3.b > 0) {
      this.send('event3', r3.c);
    }
  },
});

reaction3.link(reaction2); // feedback chain back to reaction2

//
// fire the events that wil trigger the reactions
//
emitterA.emit('data', 10); // event1
emitterB.emit('data', 20); // event2
emitterC.emit('foo', 5);   // event3

```

The condition on reaction3 will 