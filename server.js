var restify = require('restify');
var fetch = require('node-fetch')

function authenticate(req, res, next) {
    res.send('hello ' + req.params.name);
    next();
}

function getName(req, res, next) {
    //fetch('http://www.google.com')
    try {
        console.log("entering try block");
        throw "thrown message";
        console.log("this message is never seen");
    }
}

var server = restify.createServer();

server.get("/getName", getName);
server.post("/auth", function (req, resMain, next) {
    if (req.body.message && req.body.user && req.body.room) {
        var text = req.body.message;
        var user = req.body.user;
        var password = req.body.password;
        console.log(user + ": " + text);

        if (user === 'ADMIN' && password === "digi123") {
            resMain.send({ response: "USER OK" });
        } else {
            resMain.send({ response: "USER INVALID" });
        }
    } else {
        resMain.send(400, { response: "Incorrect JSON structure" });
    }
    return next();
});

//server.get('/hello/:name', respond);
//server.head('/hello/:name', respond);

server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});