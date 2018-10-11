'use strict';

const Yang = require('yang-js')

const { Property } = Yang
const { Generator, Channel, Reaction, Reducer, Neural } = require('./lib')

const assert = require('assert')

module.exports = require('./kinetic-object-swarm.yang').bind({
  'feature(url)': require('url'),
  'feature(channel)': Channel,
  
  'extension(generator)': {
    scope: {
      anydata:         '0..n',
      anyxml:          '0..n',
      choice:          '0..n',
      container:       '0..n',
      description:     '0..1',
      'if-feature':    '0..n',
      input:           '0..1',
      leaf:            '0..n',
      'leaf-list':     '0..n',
      list:            '0..n',
      output:          '0..1',
      reference:       '0..1',
      status:          '0..1',
      uses:            '0..n',
      'kos:extends':   '0..n',
      'kos:reaction':  '0..n',
      'kos:reduces':   '0..n'
    },
    target: {
      module: '0..n'
    },
    resolve() {
      this.once('compile:after', () => {
        const reaction = this.lookup('extension', 'kos:reaction')
        const container = this.lookup('extension', 'container')
        if ((this.input && this.input.nodes.length) || (this.output && this.output.nodes.length))
          throw this.error('cannot contain data nodes in generator input/output')
        
        const core = new Yang('kos:reaction', 'core', reaction).bind(this.binding)
        core.extends(this.input, this.output, this['if-feature'])
        this.update(core)
        this.removes(this.input, this.output)
        
        const state = new Yang('container', 'state', container)
        const nodes = this.nodes.filter(n => {
          return (n.kind in container.scope) && (n.tag !== 'state')
        })
        state.extends(nodes)
        this.removes(nodes)
        this.update(state)
      })
      let deps = this.match('if-feature','*')
      if (deps && !deps.every(d => this.lookup('feature', d.tag)))
        throw this.error('unable to resolve every feature dependency')
    },
    transform(self, ctx={}) {
      for (let expr of this.exprs) {
        self = expr.eval(self, ctx);
      }
      return self
    },
    construct(parent, ctx) {
      if (parent instanceof Neural.Layer)
        return new Generator(this).join(parent)
      return parent
    }
  },
  'extension(reaction)': {
    scope: {
      description:   '0..1',
      'if-feature':  '0..n',
      input:         '1',
      output:        '0..1',
      reference:     '0..1',
      status:        '0..1'
    },
    target: {
      module: '0..n'
    },
    resolve() {
      if (this.input.nodes.length || (this.output && this.output.nodes.length))
        throw this.error("cannot contain data nodes in reaction input/output")
      let deps = this.match('if-feature','*')
      if (deps && !deps.every(d => this.lookup('feature', d.tag)))
        throw this.error('unable to resolve every feature dependency')
    },
    transform(self) {
      const { consumes, produces, persists } = self
      this.input  && this.input.exprs.forEach(expr => expr.apply(consumes, persists))
      this.output && this.output.exprs.forEach(expr => expr.apply(produces))
      
      let features = this.match('if-feature','*') || []
      self.depends = features.map(f => this.lookup('feature', f.tag))
      return self
    },
    construct(parent, ctx) {
      if (parent instanceof Neural.Layer)
        return new Reaction(this).join(parent)
      return parent
    }
  },
  'extension(topic)': {
    scope: {
      anydata:     '0..n',
      anyxml:      '0..n',
      choice:      '0..n',
      container:   '0..n',
      description: '0..1',
      leaf:        '0..n',
      'leaf-list': '0..n',
      list:        '0..n',
      reference:   '0..1',
      status:      '0..1',
      uses:        '0..n'
    },
    target: {
      module: '0..n'
    },
    resolve() {

    }
  },
  'extension(flow)': {
    scope: {
      description:        '0..1',
      'require-instance': '0..1',
      reference:          '0..1',
      status:             '0..1'
    },
    target: {
      input:  '0..n',
      output: '0..n'
    },
    resolve() {
      let schema = this.lookup('grouping', this.tag)
      if (!schema)
        throw this.error(`unable to resolve ${this.tag} grouping definition`)
    },
    transform(data, persists) {
      let { 'require-instance': required } = this
      let schema = this.lookup('grouping', this.tag)
      if (data instanceof Set) data.add(schema)
      if (persists instanceof Set) {
        if (required && required.tag)
          persists.add(schema)
      }
      return data
    }
  },
  'extension(node)': {
    scope: {
      description:        '0..1',
      'require-instance': '0..1',
      reference:          '0..1',
      status:             '0..1'
    },
    target: {
      input:  '0..n',
      output: '0..n'
    },
    resolve() {
      let schema = this.locate(this.tag)
      if (!schema)
        throw this.error(`unable to resolve ${this.tag} data node`)
    },
    transform(data, persists) {
      let { 'require-instance': required } = this
      let schema = this.locate(this.tag)
      if (data instanceof Set) data.add(schema)
      if (persists instanceof Set) {
        if (required && required.tag)
          persists.add(schema)
      }
      return data
    }
  },
  'extension(extends)': {
    resolve() {
      let from = this.lookup('kos:generator', this.tag)
      if (!from)
        throw this.error(`unable to resolve ${this.tag} component`)
      from = from.clone().compile()
      from.nodes.forEach(n => this.parent.merge(n, { replace: true }))
      if (!this.parent.binding)
        this.parent.bind(from.binding)
    }
  },
  'extension(array)': {
    scope: {
      config:             '0..1',
      description:        '0..1',
      'if-feature':       '0..n',
      'max-elements':     '0..1',
      'min-elements':     '0..1',
      must:               '0..n',
      'ordered-by':       '0..1',
      reference:          '0..1',
      status:             '0..1',
      type:               '0..1',
      units:              '0..1',
      when:               '0..1'
    },
    target: {
      augment:   '0..n',
      container: '0..n',
      grouping:  '0..n',
      input:     '0..n',
      list:      '0..n',
      module:    '0..n',
      notification: '0..n',
      output:    '0..n',
      submodule: '0..n'
    },
    predicate(data=[]) {
      assert(data instanceof Array, "data must contain an Array")
    },
    transform(data, ctx) {
      if (!data) {
        data = []
        for (let expr of this.exprs)
          data = expr.eval(data, ctx)
        return undefined
      }
      if (!(data instanceof Array)) data = [ data ]
      data = data.filter(Boolean)
      for (let expr of this.exprs) {
        if (expr.kind === 'type') continue
        data = expr.eval(data, ctx)
      }
      if (this.type)
        data = this.type.apply(data, ctx)
      return data
    },
    construct(data={}, ctx={}) {
      return new Property(this.datakey, this).join(data, ctx.state)
    }
  }
})
