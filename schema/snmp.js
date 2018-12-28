// SNMP transaction flow

'use strict'

const { kos = require('..') } = global

const PROTOCOLS = [ 'snmp:' ] // for now...

module.exports = kos.create('snmp')
  .desc("reactions to SNMP GET/SET commands")

  .pre('module/net-snmp')
  .in('snmp:connect')
  .out('snmp:session','snmp:connect/url')
  .bind(connect)

  .pre('module/net-snmp')
  .in('snmp:request','snmp:session')
  .out('snmp:response')
  .bind(request)

  .in('snmp:get')
  .out('snmp:request')
  .bind(snmpget)

  .in('snmp:set')
  .out('snmp:request')
  .bind(snmpset)

  .pre('snmp:session')
  .in('snmp:walk')
  .out('snmp:response')
  .bind(snmpwalk)

  .pre('module/url')
  .in('snmp:connect/url')
  .out('snmp:connect')
  .bind(connectByUrl)

function connect(opts) {
  if (typeof opts === 'string') return this.send('snmp:connect/url', opts)

  const snmp = this.get('module/net-snmp')
  const sessions = this.use('sessions', new Map)

  this.debug(`supported protocols: ${PROTOCOLS}`)
  
  const { protocol, hostname, port, community, retries, timeout, transport, version } = opts = normalizeOptions(opts)
  if (!PROTOCOLS.includes(protocol)) this.throw("unsupported protocol", protocol)

  const addr = `${protocol}//${hostname}:${port}`
  if (!sessions.has(addr)) {
    let session = snmp.createSession(hostname, community, { port, retries, timeout, transport, version })
    session.on('error', this.error.bind(this))
    sessions.set(addr, session)
  }
  this.send('snmp:session', sessions.get(addr))
}

function request(req, session) {
  const snmp = this.get('module/net-snmp')
  const [ method, ...args ] = req
  session[method](args, (err, varbinds) => {
    if (err) return this.error(err)
    varbinds = varbinds.filter(data => {
      let error = snmp.isVarbindError(data)
      if (error) this.error(snmp.varbindError(data))
      return !error
    })
    this.send('snmp:response', varbinds);
  });
}

function snmpget(oids) { this.send('snmp:request', [ 'get', ...oids ]) }
function snmpset(varbinds) {
  //var varbinds = [{oid: "1.3.6.1.4.1.1206.4.2.1.1.2.1.3.15", type: 2, value: 15}];
  this.send('snmp:request', [ 'set', ...varbinds ])
}
function snmpwalk(oid) {
  const snmp = this.get('module/net-snmp')
  const session = this.get('snmp:session')
  let results = []
  const feed = (varbinds) => {
    this.debug(varbinds)
    varbinds = varbinds.filter(data => {
      let error = snmp.isVarbindError(data)
      if (error) this.error(snmp.varbindError(data))
      return !error
    })
    results.concat(varbinds)
  }
  const done = (error) => {
    this.debug(results)
    if (error) return this.error(error)
    this.send('snmp:response', results)
  }
  session.walk(oid, feed, done)
}

function connectByUrl(dest) {
  let url = this.get('module/url')
  let opts = url.parse(dest, true)
  if (!opts.slashes) opts = url.parse('snmp://'+dest, true)
  this.send('snmp:connect', Object.assign(opts, opts.query))
}

function normalizeOptions(opts) {
  return {
    protocol: opts.protocol || 'snmp:',
    hostname: opts.hostname || '0.0.0.0',
    port:     parseInt(opts.port, 10) || 161,
    retries:  parseInt(opts.retries, 10) || 1,
    timeout:  parseInt(opts.timeout, 10) || 5000,
    version:  0,
    community: opts.community || 'public'
  }
}
