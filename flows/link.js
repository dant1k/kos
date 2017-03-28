// Link transaction flow
//
// NOTE: this flow REQUIREs the 'url' module and will become active
// if already present locally, receives it from the upstream, or fed
// by the user directly.

'use strict'

const { kos = require('..') } = global

module.exports = kos.create('link')
  .summary("Provides dynamic client/server communication flows for various protocols")
  .require('module/url')
  .default('streams', new Map)

  .import(require('./net')) // supports kos, tcp, unix protocols
  .import(require('./ws'))  // supports ws, wss protocols

  .in('link/connect').out('net/connect','ws/connect').bind(connect)
  .in('link/listen').out('net/listen','ws/listen').bind(listen)

  .in('link/connect/url').out('link/connect').bind(connectByUrl)
  .in('link/listen/url').out('link/listen').bind(listenByUrl)

  .in('link').out('link/stream').bind(createLinkStream)


function connect(opts) {
  switch (opts.protocol) {
  case 'ws:':
  case 'wss:':
    this.send('ws/connect', opts)
    break;
  case 'tcp:':
  case 'udp:':
  case undefined:
    this.send('net/connect', opts)
    break;
  default:
    this.warn('unsupported protocol', opts.protocol)
  }
}

function listen(opts) {
  switch (opts.protocol) {
  case 'ws:':
  case 'wss:':
    this.send('ws/listen', opts)
    break;
  case 'tcp:':
  case 'udp:':
  case undefined:
    this.send('net/listen', opts)
    break;
  default:
    this.warn('unsupported protocol', opts.protocol)
  }
}

function connectByUrl(dest) {
  const url = this.fetch('module/url')
  let opts = url.parse(dest, true)
  if (!opts.protocol) opts = url.parse('tcp:'+dest, true)
  this.send('link/connect', Object.assign(opts, opts.query))
}

function listenByUrl(dest) {
  const url = this.fetch('module/url')
  let opts = url.parse(dest, true)
  if (!opts.protocol) opts = url.parse('tcp:'+dest, true)
  this.send('link/listen', Object.assign(opts, opts.query))
}

function createLinkStream(link) {
  let { addr, socket } = link
  let streams = this.fetch('streams')
  let stream = streams.has(addr) ? streams.get(addr) : new kos.Essence

  socket.on('active', () => {
    let io = stream.io()
    socket.pipe(io, { end: false }).pipe(socket)
    socket.on('close', () => {
      io.unpipe(socket)
      socket.destroy()
    })
  })
  if (!streams.has(addr)) {
    stream.on('ready', () => this.debug("ready now!"))
    streams.set(addr, stream)
    this.send('link/stream', stream)
  }
}