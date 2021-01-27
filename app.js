const ws = require('ws');

const Cookies = require('cookies');

const Koa = require('koa');

const bodyParser = require('koa-bodyparser');

const controller = require('./controller');

const templating = require('./templating');

const WebSocketServer = ws.Server;

const config = require('./config');

const app = new Koa();

console.log('runing env:', process.env.NODE_ENV);

const isProduction = process.env.NODE_ENV === 'production';

// log request URL:
app.use(async (ctx, next) => {
    console.log(`Process ${ctx.request.method} ${ctx.request.url}...`);
    var
        start = new Date().getTime(),
        execTime;
    await next();
    execTime = new Date().getTime() - start;
    ctx.response.set('X-Response-Time', `${execTime}ms`);
});

// parse user fron cookie:
app.use(async (ctx, next) => {
    ctx.state.user = parseUser(ctx.cookies.get('name') || '');
    await next();
});

// static file support:
console.log('load static file');
let staticFiles = require('./static-files');
app.use(staticFiles('/static/', __dirname + '/static'));

// parse request body:
app.use(bodyParser());

// add nunjucks as view:
app.use(templating('views', {
    noCache: !isProduction,
    watch: !isProduction
}));

// add controller:
app.use(controller());

// koa app listen() return http.Server:
let server = app.listen(config.setting.port);

// 消息ID:
var messageIndex = 0;
var msgStack = [];

function createMessage(type, user, data) {
    messageIndex++;
    let time = new Date(Date.now());
    return JSON.stringify({
        id: messageIndex,
        type: type,
        user: user,
        data: data,
        time: String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0') + ':' + String(time.getSeconds()).padStart(2, '0')
    });
}

function createWebSocketServer(server) {
    let wss = new WebSocketServer({
        server: server
    })

    wss.on('connection', function (ws, req) {
        let name_cookie;
        req.headers.cookie = req.headers.cookie.split(';').forEach(function (cookie) {
            let parts = cookie.split('=');
            if (parts[0].trim() == 'name') {
                name_cookie = parts[1];
            }
        });

        let user = parseUser(name_cookie);

        if (!user) {
            // Cookie不存在或无效，直接关闭WebSocket:
            ws.close(4001, 'Invalid user');
        }
        // // 识别成功，把user绑定到该WebSocket对象:
        ws.user = user;
        // // 绑定WebSocketServer对象:
        ws.wss = wss;

        ws.on('message', onMessage);
        ws.on('close', onClose);

        onConnect.apply(ws);
    });

    wss.broadcast = function (data) {
        wss.clients.forEach(function (client) {
            if (data) {
                client.send(data);
            }
        });
    };

    return wss;
};

function parseUser(obj) {
    if (!obj) {
        return;
    }
    console.log('try parse:' + obj);
    let s = '';
    if (typeof (obj === 'string')) {
        s = obj;
    } else if (obj.headers) {
        let cookies = new Cookies(obj, null);
        s = cookie.get('name');
    }
    if (s) {
        try {
            let user = JSON.parse(Buffer.from(s, 'base64').toString());
            console.log(`User: ${user.name}, ID: ${user.id}`);
            return user;
        } catch (e) {
            // ignore
        }
    }
}

function onConnect() {
    let user = this.user;
    if (user != null) {
        let msg = createMessage('join', user, `${user.name} joined.`);
        this.wss.broadcast(msg);
    }

    // build user list:
    let users = [];
    this.wss.clients.forEach(function (client) {
        users.push(client.user)
    });
    this.send(createMessage('list', user, users));
    let that = this;
    msgStack.forEach(function (data) {
        if (data) {
            that.send(data);
        }
    })
}

function onMessage(message) {
    console.log(message);
    if (message && message.trim()) {
        let msg = createMessage('chat', this.user, message.trim());
        if (msgStack.length > 5) {
            msgStack.shift();
        }
        msgStack.push(msg);
        this.wss.broadcast(msg);
    }
}

function onClose() {
    let user = this.user;
    if (user != null) {
        let msg = createMessage('left', user, `${user.name} is left.`);
        this.wss.broadcast(msg);
    }
}

app.wss = createWebSocketServer(server);

console.log('app started at port ' + config.setting.port + '...');
