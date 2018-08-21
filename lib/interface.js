'use strict';

const debug = require('debug')('kos:interface')
const delegate = require('delegates')
const merge = require('deepmerge')
const uuid = require('uuid')
const Yang = require('yang-js')

const { Synapse } = require('./neural')
const Pulse = require('./pulse')
const Model = require('./model')

const kState  = Symbol.for('state')
const kSchema = Symbol.for('schema')
const kModel  = Symbol.for('model')
const kBounds = Symbol.for('bounds')

class Interface extends Synapse {

  get [Symbol.toStringTag]() { return `Interface:${this.uri}` }
  get type()  { return Symbol.for('kos:interface') }
  get label() { return this.datakey }
  get uri()   { return this.label }
  get summary() { return this[kSchema].description }
  get interfaces() { return this.nodes.filter(x => x instanceof Interface) }

  get state()    { return this[kModel].get() }
  set state(obj) { this[kModel].set(obj) }

  set model(m) {
    // Feed updates to inflow & outflow
    m.on('update', prop => {
      let { path, content } = prop
      const pulse = new Pulse(path, this).add(content)
      this.inflow.write(pulse)
      this.outflow.write(pulse)
    })
    this[kModel] = m
  }
  get schema() { return this[kSchema] }
  set schema(x) { 
    if (typeof x === 'string') x = Yang.parse(x)
    if (!(x instanceof Yang))
      throw new Error("Interface schema must be an instance of Yang")
    this.model = new Model(x)
    this[kSchema] = x
    Object.preventExtensions(this)
    debug(`${this} applying schema`)
    x.apply(this)
    
    // TODO: handle schema change
  }
  constructor(schema, state) {
    super()
    this.schema = schema
    //this.state  = state

    //
    // Make the Interface executable
    //
    let Kinetic = state => new this.constructor(this[kSchema], merge(this.state, state))
    return Object.setPrototypeOf(Kinetic, this)
  }
  join(parent) {
    if (!parent) throw new Error("must provide valid 'parent' argument")
    if (parent instanceof Synapse) return super.join(parent)
    debug(`${this} join ${parent.constructor.name}`)
    const get = () => this
    get.bound = { content: this }
    Object.defineProperty(parent, this.datakey, { 
      get, enumerable: true
    })
    return parent
  }
  feed(key, ...values) {
    this.write(new Pulse(key, this).add(...values))
    return this
  }
  inspect() {
    const { label, uri, summary } = this
    return Object.assign({ label, uri, summary }, super.inspect())
  }
}

delegate(Interface.prototype, kSchema)
  .getter('datapath')
  .getter('datakey')
  .getter('tag')
  .getter('kind')
  .method('lookup')
  .method('locate')

delegate(Interface.prototype, kModel)
  .method('in')
  .method('get')
  .method('set')

delegate(Interface.prototype, kBounds)
  .getter('consumes')
  .getter('produces')

module.exports = Interface
