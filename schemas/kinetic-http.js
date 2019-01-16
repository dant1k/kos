require('yang-js')

module.exports = require('./kinetic-http.yang').bind({
  // Bind Personas
  Connector: { request, get },
  Listener: { listen, route }
})

function request(req) {
  const agent = this.use('http:agent')
  let { url, type='json', method, header={}, query='', data } = req
  method = method.toLowerCase()
  let request = agent[method](url).type(type).set(header).query(query)
  this.debug(`curl -v -X ${method} ${url} -d '${JSON.stringify(data)}'`)
  switch (method) {
  case 'post':
  case 'put':
  case 'patch':
    request = request.send(data)
    break;
  }
  request
    .then(res => this.send('http:response', res))
    .catch(err => {
      this.error(err)
      this.warn(`${err.status} on ${method} ${url} got ${err.response.text}`)
    })
}

function get(req) {
  this.send('http:request', req)
}

function listen(local) {
  const http = this.use('http:server')
  let { server, protocol, port, hostname, uri } = local
  if (!server) {
    let server = http.createServer((req, res) => {
      this.send('http:server-request', { req, res })
    })
    server.on('connection', socket => {
      let uri = `${protocol}//${socket.remoteAddress}:${socket.remotePort}`
      this.info(`accept ${uri}`)
      this.send('net:connection', { uri, socket })
    })
    server.on('listening', () => {
      this.info(`listening on ${uri}`)
      this.send('http:server', server)
    })
    server.on('error', this.error.bind(this))
  }
  this.debug(`attempt ${uri}`)
  server.listen(port, hostname)
}

function route(server, route) {

}

function proxy(req, proxy) {
  this.send('http:request', Object.assign({}, req, {
    host: proxy.host
  }))
}