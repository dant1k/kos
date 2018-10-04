'use strict';

const debug = require('debug')('kos:generator');
const delegate = require('delegates');
const path = require('path');
const equal = require('deep-equal');
const merge = require('deepmerge');
const Yang = require('yang-js');

const Neural = require('./neural');
const Filter = require('./filter');
const Pulse = require('./pulse');
const Reaction = require('./reaction');

const kCore = Symbol.for('kos:core');
const kSchema = Symbol.for('kos:schema');
const kState = Symbol.for('kos:state');

class Generator extends Neural.Layer {

  get [Symbol.toStringTag]() { return `Generator:${this.uri}` }
  get type() { return Symbol.for('kos:generator') }
  get name() { return this.datakey }
  get uri()  { return this.datapath }
  get summary() { return this.description ? this.description.tag : undefined }

  get inputs()  { return this.nodes.filter(n => Array.from(n.consumes).some(s => s.node)) }
  get outputs() { return this.nodes.filter(n => Array.from(n.produces).some(s => s.node)) }
  
  get core() { return this[kCore] }
  set core(x) {
    if (!(x instanceof Reaction))
      throw this.error('Generator core must be an instance of Reaction')
    this[kCore] = x
    x.join(this)
  }
  get schema() { return this[kSchema] }
  set schema(x) {
    if (!(x instanceof Yang))
      throw this.error("Generator schema must be an instance of Yang");
    this[kSchema] = x;
    x.apply(this);
    this.core = this.nodes.find(n => n.tag === 'core')
    // TODO: handle schema change event
  }
  get state() { return this[kState] }
  set state(x={}) {
    if (!this[kState]) this[kState] = x
    else {
      for (let k of Object.keys(x)) {
        this[kState][k] = x[k]
      }
    }
  }
  
  constructor(schema, state) {
    super({
      objectMode: true,
      inflow:  new Filter({ filter: x => this.incoming(x) }),
      outflow: new Filter({ filter: x => this.outgoing(x) })
    })
    this.schema = schema;
    this.state = state
  }
  feed(topic, ...values) {
    this.core.write(new Pulse(topic, this).add(...values))
    return this
  }
  save(state, emit=true) {
    if (typeof state === "object") {
      debug(`${this} saving new state for: ${Object.keys(state)}`)
      const arrayMerge = (d,s,o) => s
      const keys = Object.keys(state)
      const prev = this.state
      let diff = false
      // debug(`${this} prev is:`, prev)
      // debug(`${this} new is:`, state)
      for (let k of keys) {
        if (!equal(prev[k], state[k])) {
          diff = true
          break;
        }
      }
      if (diff) {
        debug(`${this} state changed!`)
        this.state = merge(prev, state, { arrayMerge })
        if (emit) this.emit("save", this.state)
        // debug(`${this} final:`, this.state)
      }
    }
    return this
  }
  incoming(pulse) {
    const { topic, schema } = pulse
    const pass = this.consumes.has(schema)
    debug(`${this} <- ${topic} (${schema.datakey}) [${pass ? 'ACCEPT' : 'DENY'}]`)
    return pass
  }
  outgoing(pulse) {
    const { topic, schema, data } = pulse
    if (topic === 'kos:state') {
      
    }
    const pass = this.produces.has(schema)
    debug(`${this} -> ${topic} (${schema.datakey}) [${pass ? 'ACCEPT' : 'DENY'}]`)
    return pass
  }
  join(parent) {
    if (parent instanceof Neural.Layer) return super.join(parent)
    return parent
  }
  inspect() {
    const { id, type, name, uri, summary, consumes, produces, inputs, hiddens, outputs, orphans } = this
    return {
      id, type, name, uri, summary,
      consumes: Array.from(consumes).map(x => x.datapath),
      produces: Array.from(produces).map(x => x.datapath),
      inputs, hiddens, outputs, orphans
    }
  }
}

delegate(Generator.prototype, kSchema)
  .getter('datapath')
  .getter('datakey')
  .getter('tag')
  .getter('kind')
  .getter('binding')
  .method('bind')
  .method('lookup')
  .method('locate')

module.exports = Generator
