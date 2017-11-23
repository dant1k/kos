'use strict';

const debug = require('debug')('kos:dataflow')
const delegate = require('delegates')

const Dataflow = require('./dataflow')
const Reaction = require('./reaction')

// default value for maximum number of embedded dataflows within the Dataflow
// NOTE: this is not a hard limit, but a warning will be generated if exceeded
const KINETIC_MAX_FLOWS = 30

class Persona extends Dataflow {

  get [Symbol.toStringTag]() { return `Persona:${this.label}` }

  constructor(props) {
    if (typeof props === 'string') 
      props = { label: props }

    if (!props.label) throw new Error("must supply 'label' to create a new Persona")

    super(props)

    const { 
      enabled = true, 
      personas = [], 
      reactions = [] } = props

    personas.forEach(r => this.load(r))
    reactions.forEach(t => this.add(t))
    enabled && this.enable()
    debug(this.identity, 'new', this.id)

    // return an executable Persona (instead of pure Object)
    let Kinetic = state => this.clone(state, { feed: true })
    return Object.setPrototypeOf(Kinetic, this)
  }

  create() { return new Persona(...arguments) }

  desc(purpose='')    { this.props.purpose = purpose; return this }
  pass(passive=false) { this.props.passive = passive; return this }

  load(flow, state) {
    let foo = this.create(flow).save(state).join(this)
    return this
  }
  unload(flow) {
    if (flow instanceof Persona) flow.leave(this)
    return this
  }

  // ENABLE/DISABLE this Persona
  enable()  { 
    if (!this.enabled) {
      this.props.enabled = true
      super.link(this.core)
    }
    return this
  }
  disable() { 
    if (this.enabled) {
      this.props.enabled = false
      super.unlink(this.core)
    }
    return this
  }

  // overload Dataflow.save
  save(state, opts={}) {
    const { feed = false } = opts
    super.save(...arguments)
    if (feed && state) {
      debug(this.identity, `save feed: ${Object.keys(state)}`)
      for (let k of Object.keys(state))
        this.core.feed(k, state[k])
    }
    return this
  }

  //--------------------------------------------------------
  // Reaction definitions and associations for this Persona
  //--------------------------------------------------------
  add(reaction) {
    new Reaction(reaction).join(this)
    return this
  }

  pre(...keys) { return new Reaction({ requires: keys }).join(this) }
  in(...keys)  { return new Reaction({ inputs: keys }).join(this) }

  // LINK/UNLINK additional flows into the Persona
  link(flow) {
    this.core.pipe(flow); flow.pipe(this.core);
    return this; 
  }
  unlink(flow) { 
    this.core.unpipe(flow); flow.unpipe(this.core); 
    return this; 
  }

  //------------------------------------------------
  // CORE DATAFLOW (dynamically created when needed)
  //------------------------------------------------
  get core() {
    if (!this._core) {
      const { maxFlows = KINETIC_MAX_FLOWS } = this.props
      const logs = [ 'error', 'warn', 'info', 'debug' ]
      this._core = new Dataflow({
        maxListeners: maxFlows,
        filter: stimulus => {
          const { key } = stimulus
          const isLog = logs.indexOf(key) !== -1
          // we trace the flow of transitions on the STIMULUS
          let flows = []
          if (this.seen(stimulus)) {
            // from external flow
            this.notify && flows.push('accept')
            if (stimulus.match(this.inputs.concat(this.requires))) {
              debug(this.identity, '<==', key)
              // update the stimulus that it's been accepted into this flow
              this.mark(stimulus, true)
              if (this.notify) {
                if (stimulus.match(this.consumes))
                  flows.push('consume')
                if (stimulus.match(this.absorbs))
                  flows.push('absorb')
              }
            } else {
              if (this.notify && !isLog) {
                flows.push('reject')
                this.emit('flow', stimulus, flows)
              }
              isLog ? this.emit('log', stimulus) : this.emit('dropped', stimulus)
              return false
            }
          } else { 
            // from internal flow
            if (isLog) {
              this.emit('log', stimulus)
              return true
            }
            if (this.notify) {
              flows.push('feedback')
              stimulus.match(this.consumes) ? flows.push('consume') : flows.push('reject')
            }
            if (stimulus.match(this.absorbs)) {
              debug(this.identity, '<->', key)
              this.mark(stimulus, true) // prevent external propagation
              this.notify && flows.push('absorb')
            } else if (stimulus.match(this.outputs)) {
              debug(this.identity, '==>', key)
              this.notify && flows.push('produce')
            } else {
              // unhandled side-effect byproduct
              debug(this.identity, '<--', key)
              this.notify && flows.push('byproduct')
              this.passive || this.mark(stimulus) // prevent external propagation
            }
            this.notify && this.emit(key, stimulus.value)
          }
          this.reactions.forEach(r => r(stimulus))
          this.notify && this.emit('flow', stimulus, flows)
          return true
        }
      })
    }
    return this._core
  }

  contains(id) {
    if (this.reactions.some(x => x.id === id)) return true
    if (this.personas.some(x => x.contains(id))) return true
    return false
  }

  // finds a matching reaction based on ID from the local hierarchy
  find(id) {
    if (this.id === id) return this
    let match = this.reactions.find(x => x.id === id)
    if (match) return match
    for (const flow of this.personas) {
      match = flow.find(id)
      if (match) return match
    }
    return
  }

  //----------------------------------------------
  // Collection of Getters for inspecting Persona
  //----------------------------------------------

  get type()    { return Symbol.for('kos:persona') }
  get label()   { return this.props.label }
  get purpose() { return this.props.purpose }
  get passive() { return this.props.passive === true }
  get enabled() { return this.props.enabled === true }
  get active()  { return this.enabled && (this.parent ? this.parent.active : true) }
  get notify()  { return this.listenerCount('flow') > 0 }

  get cache() {
    if (!this._cache) {
      let personas = [], reactions = [], dataflows = []
      for (let flow of this.core.flows) {
        if (flow.id === this.id) continue
        if (flow instanceof Persona)
          personas.push(flow)
        else if (flow instanceof Reaction)
          reactions.push(flow)
        else if (flow instanceof Dataflow)
          dataflows.push(flow)
      }
      this._cache = {
        personas, reactions, dataflows, 

        requires: (() => {
          let flows = reactions.concat(personas)
          return extractUniqueKeys(flows, 'requires')
        }).call(this),
        
        inputs: (() => {
          let flows = this.passive ? reactions.concat(personas) : reactions
          return extractUniqueKeys(flows, 'inputs', 'requires')
        }).call(this),

        outputs:  extractUniqueKeys(reactions, 'outputs'),
        consumes: extractUniqueKeys(reactions, 'inputs', 'requires'),
        absorbs:  extractUniqueKeys(personas, 'inputs') 
      }
      this.core.once('adapt', flow => {
        debug(this.identity, "clearing cache")
        this._cache = null
        this.emit('adapt', this) // XXX - should we propagate flow instead?
      })
    }
    return this._cache
  }

  inspect() {
    return Object.assign(super.inspect(), {
      label:     this.label,
      purpose:   this.purpose,
      passive:   this.passive,
      requires:  this.requires,
      personas:  this.personas.map(x => x.inspect()),
      reactions: this.reactions.map(x => x.inspect()),
      dataflows: this.dataflows.map(x => x.inspect())
    })
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      label:     this.label,
      purpose:   this.purpose,
      passive:   this.passive,
      requires:  this.requires,
      personas:  this.personas.map(x => x.toJSON()),
      reactions: this.reactions.map(x => x.toJSON()),
      inputs:    this.inputs,
      outputs:   this.outputs
    })
  }
}

delegate(Persona.prototype, 'cache')
  .getter('requires')
  .getter('inputs')
  .getter('outputs')
  .getter('consumes')
  .getter('absorbs')
  .getter('reactions')
  .getter('personas')
  .getter('dataflows')

function extractUniqueKeys(flows=[], ...names) {
  let keys = flows.reduce((a, flow) => {
    return a.concat(...names.map(x => flow[x]))
  }, [])
  return Array.from(new Set(keys))
}

module.exports = Persona
