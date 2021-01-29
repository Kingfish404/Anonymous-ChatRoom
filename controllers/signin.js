// sign in:
var CryptoJS = require("crypto-js");

var index = 0;

module.exports = {
    'GET /signin': async (ctx, next) => {
        let names = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
        let name = names[index % names.length];
        ctx.render('signin.html', {
            name: `阿${name}`
        })
    },

    'POST /signin': async (ctx, next) => {
        index++;
        if (index > 100000) {
            index = 0;
        }
        let name = ctx.request.body.name || '路人甲';
        let user = {
            id: index,
            name: name,
            image: index % 10
        };
        let value = Buffer.from(JSON.stringify(user)).toString('base64');
        console.log(`Set cookie value:${value}`);
        let ciptertest = CryptoJS.AES.encrypt(value,ctx.key).toString();
        console.log(`Encrypt value:${ciptertest}`);
        ctx.cookies.set('name', ciptertest);
        ctx.response.redirect('/');
    },

    'GET /signout': async (ctx, next) => {
        ctx.cookies.set('name', '');
        ctx.response.redirect('/signin');
    }
}