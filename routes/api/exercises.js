const express = require('express');
const router = express.Router();
const {
  ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, TOKEN_SECRET
} = require('../../config');
const { checkExercise } = require('../../helpers/checks');
const { saveExercise, saveSolution, saveUser} = require('../../db/saveData');
const { getUserId, getUser, getUserSolutions} = require('../../db/getData');
const { ADMIN_NAME, ADMIN_PASSWORD, CLIENT_ID, CLIENT_SECRET} = require('../../config');
const request = require('request');
const {
  getExercisePreviews, getExerciseByID,
  getAllFormalizationsForProposition,
  getUsersByPropositionId
} = require('../../db/getData');
const evaluate = require('../../helpers/evaluate');
const {json} = require("express");
const jwt = require('jsonwebtoken');

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, TOKEN_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

router.post('/', authenticateJWT, async (req, res) => {
  try {
    if(!isAdmin(req.headers.authorization)){
      res.sendStatus(403);
      return;
    }
    let exercise = req.body;
    if (checkExercise(exercise)) {
      await saveExercise(exercise);
    } else {
      res.sendStatus(400);
      return;
    }

    res.status(201).json(exercise);
    
  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});

router.get('/', authenticateJWT , async (req, res) => {
  try {

    const previews = await getExercisePreviews();

    if (!previews) {
      res.sendStatus(404);
      return;
    }

    res.status(200).json(previews);
  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});

router.get('/:exercise_id', authenticateJWT, async (req, res) => {
  try {
    const { exercise_id } = req.params;
    const parsed_exercise_id = parseInt(exercise_id, 10);
    if (isNaN(parsed_exercise_id)) {
      res.sendStatus(404).end();
      return;
    }

    const exercise = await getExerciseByID(exercise_id);
    if (!exercise) {
      res.sendStatus(404);
      return;
    }
    
    res.status(200).json(exercise);

  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});

router.get('/progress/:proposition_id', authenticateJWT, async (req, res) => {
  try {
    if(!isAdmin(req.headers.authorization)){
      res.sendStatus(403);
      return;
    }
    const { proposition_id } = req.params;
    const parsed_proposition_id = parseInt(proposition_id, 10);
    if (isNaN(parsed_proposition_id)) {
      res.sendStatus(404).end();
      return;
    }

    const users = await getUsersByPropositionId(parsed_proposition_id);
    res.status(200).json(users);

  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});

router.get('/progress/user/:user_id/:proposition_id', authenticateJWT, async (req, res) => {
  try {
    if(!isAdmin(req.headers.authorization)){
      res.sendStatus(403);
      return;
    }
    const { user_id } = req.params;
    const parsed_user_id = parseInt(user_id, 10);
    if (isNaN(parsed_user_id)) {
      res.sendStatus(404).end();
      return;
    }
    const { proposition_id } = req.params;
    const parsed_proposition_id = parseInt(proposition_id, 10);
    if (isNaN(parsed_proposition_id)) {
      res.sendStatus(404).end();
      return;
    }

    const solutions = await getUserSolutions(parsed_user_id, parsed_proposition_id);
    res.status(200).json(solutions);

  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});

router.post('/:exercise_id/:proposition_id', authenticateJWT, async (req, res) => {
  try {
    let { exercise_id, proposition_id } = req.params;
    let { solution, helpSolution, user } = req.body;
    let user_id = await getUserId(user);
    user_id = user_id[0].github_id;
    exercise_id = parseInt(exercise_id, 10);
    proposition_id = parseInt(proposition_id, 10);
    if (isNaN(exercise_id) || isNaN(proposition_id)) {
      console.error('URL parameters are not numbers.');
      res.sendStatus(400);
      return;
    }

    const formalizations = await getAllFormalizationsForProposition(proposition_id);
    const exercise = await getExerciseByID(exercise_id);
    if (!formalizations || !exercise || formalizations.length === 0) {
      console.error('Missing exercise or formalizations. Cannot evaluate.');
      res.sendStatus(404);
      return;
    }
    if(isNaN(parseInt(user_id))){
      console.error('Missing log in user');
      res.sendStatus(404);
      return;
    }

    try {

      function saveSolutionWithResult (eval_status)  {
        if(eval_status.solutionToFormalization === 'OK' && eval_status.formalizationToSolution === 'OK'){
          saveSolution(user_id, proposition_id, solution, true);
        }
        else{
          saveSolution(user_id, proposition_id, solution, false);
        }
      }
      evaluate(solution, helpSolution, formalizations, exercise, res, saveSolutionWithResult );

    } catch (err) {
      console.error(err.message);
      res.sendStatus(400);
    }
  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});

router.post('/logIn',  async (req, res) => {
  try {
    let data = req.body;
     if (data.username === ADMIN_NAME && data.password === ADMIN_PASSWORD) {
      const token = generateAccessToken({ username: data.username, isAdmin: true });
      return res.status(200).json({"token": token});
    }
    else {
      console.error("Wrong user name or password")
      res.status(400);
    }

  } catch (err) {
    console.error(err.message);
    res.sendStatus(503);
  }
});




router.post('/logIn/github/auth' , async (req, res) => {
  try {
    request.post({
      url: "https://github.com/login/oauth/access_token/?client_id=" + CLIENT_ID +
          "&client_secret=" + CLIENT_SECRET + "&code=" + req.body.code,
      headers: {
        'User-Agent': 'request'
      }

    }, function (error, response, body) {
      request.get({
        url: "https://api.github.com/user",
        headers: {
          'User-Agent': 'request',
          'Authorization': 'token ' + body.split("&")[0].split("=")[1]
        }
      }, async function (error, response, body) {
        body = JSON.parse(body);
        if (body.id !== undefined) {
          saveUser(body.id, body.login);
          let user = await getUser(body.login);
          const token = generateAccessToken({username: user[0].user_name, isAdmin: user[0].is_admin});
          res.status(200).json({"token": token});
        }
      });
    });

  } catch (err) {
    console.error(err.message);
    res.sendStatus(500);
  }
});

function generateAccessToken(user) {
  let oneDay = 24* 3600 * 30;
  return jwt.sign(user, TOKEN_SECRET, { expiresIn: oneDay + 's' });
}



function isAdmin(token) {
  let t = JSON.parse(Buffer.from(token.split(" ")[1].split(".")[1], "base64").toString());
  return t.isAdmin;
}

module.exports = router;
