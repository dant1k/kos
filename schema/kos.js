'use strict';

const { Interface, Reaction }  = require('../lib')

module.exports = require('./kos.yang').bind({

  'extension(interface)': function() {
    return {
      scope: {
        description:     '0..1',
        input:           '0..1',
        output:          '0..1',
        reference:       '0..1',
        status:          '0..1',
        'kos:extends':   '0..n',
        'kos:interface': '0..n',
        'kos:state':     '0..1',
        'kos:reaction':  '0..n'
      },
      target: {
        module: '0..n'
      },
      resolve() {
        if (this.input.nodes.length || this.output.nodes.length)
          throw this.error("cannot contain data nodes in reaction input/output")
      },
      transform(self) {

      },
      construct(parent, ctx) {
        return new Interface(this).join(parent)
      }
    }
  },
  'extension(reaction)': function() {
    return {
      scope: {
        container:     '0..n',
        description:   '0..1',
        'if-feature':  '0..n',
        input:         '1',
        leaf:          '0..n',
        'leaf-list':   '0..n',
        list:          '0..n',
        output:        '1',
        reference:     '0..1',
        status:        '0..1'
      },
      target: {
        module: '0..n'
      },
      resolve() {
        if (this.input.nodes.length || this.output.nodes.length)
          throw this.error("cannot contain data nodes in reaction input/output")
      },
      transform(self) {
        const regex = /^kos:(data|node)$/
        const extract = node => {
          let { kind, tag, 'require-instance': required } = node
          let schema
          switch (kind) {
          case 'kos:node': schema = this.locate(tag)
            break;
          case 'kos:data': schema = this.lookup('grouping', tag)
            break;
          }
          if (required) required = required.tag
          return { required, schema }
        }
        let features = this.match('if-feature','*') || []
        let inputs  = this.input.exprs.filter(x => regex.test(x.kind)).map(extract)
        let outputs = this.output.exprs.filter(x => regex.test(x.kind)).map(extract)
        const depends  = new Map
        const requires = new Set
        const consumes = new Set
        const produces = new Set
        for (let f of features) {
          depends.set(f.tag, this.lookup('feature', f.tag))
        }
        for (let data of inputs) {
          const { required, schema } = data
          required ? requires.add(schema) : consumes.add(schema)
        }
        for (let data of outputs) {
          const { required, schema } = data
          produces.add(schema)
        }
        self.bounds = {
          depends, requires, consumes, produces
        }
        return self
      },
      construct(parent, ctx) {
        return new Reaction(this).join(parent)
      }
    }
  },
  'extension(data)': function() {
    return {
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
      }
    }
  },
  'extension(node)': function() {
    return {
      scope: {
        description: '0..1',
        mandatory:   '0..1',
        reference:   '0..1',
        status:      '0..1'
      },
      target: {
        input:  '0..n',
        output: '0..n'
      },
      resolve() {
        let schema = this.locate(this.tag)
        if (!schema)
          throw this.error(`unable to resolve ${this.tag} data node`)
      }
    }
  },
  'extension(extends)': function() {
    return {
      resolve() {
        let iface = this.lookup('kos:interface', this.tag)
        if (!iface)
          throw this.error(`unable to resolve ${this.tag} interface`)
        iface = iface.clone()
        iface.tag = this.tag
        this.parent.extends(iface)
      }
    }
  },
  "grouping(endpoint)": {
    uri(value) {
      const Url = this.use('kos:url')
      if (arguments.length) { // setter
        if (value) {
          this.content = value
          this.in('..').set(Url.parse(value, true))
        }
        return undefined
      } else { // getter
        if (this.content) return this.content
        return Url.format(this.in('..').content)
      }
    }
  }
})