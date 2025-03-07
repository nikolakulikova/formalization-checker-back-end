const pool = require('./db');

const saveExercise = async (
  { title, description, constants, predicates, functions, propositions, constraint }, connection
) => {
  try {
    const queryText =
        'INSERT INTO exercises(title, description, constants, predicates, functions, constraints) '
      + 'VALUES($1, $2, $3, $4, $5, $6) RETURNING exercise_id;'
    const res = await connection.query(
      queryText,
      [ title, description, constants, predicates, functions, constraint ]
    );

    const exerciseID = res.rows[0].exercise_id;

    propositions.forEach(p => {
      saveProposition(exerciseID, p, connection);
    });
    
  } catch (err) {
    console.error(err.stack);
  }
};

const saveProposition = async (exerciseID, { proposition, formalizations, constraints }, connection) => {
  try {
    const queryText =
      'INSERT INTO propositions(proposition, exercise_id) '
      + 'VALUES($1, $2) RETURNING proposition_id;';
    const res = await connection.query(
      queryText,
      [ proposition, exerciseID ]
    );

    const propositionID = res.rows[0].proposition_id;

    for(let i = 0; i < formalizations.length; i++){
      saveFormalization(propositionID, formalizations[i], constraints[i], connection);
    }

  } catch (err) {
    console.error(err.stack);
  }
};

const saveFormalization = async (propositionID, formalization, constraint, connection) => {
  try {
    const queryText =
      'INSERT INTO formalizations(formalization, constraints, proposition_id) '
      + 'VALUES($1, $2, $3);';
    await connection.query(
      queryText,
      [ formalization, constraint, propositionID ]
    );

  } catch (err) {
    console.error(err.stack);
  }
};

const saveSolution = async (studentID, propositionID, studentSolution, correctSolution, client) => {
  try {
    const queryText =
        'INSERT INTO solutions(user_id, proposition_id, solution, is_correct, date) '
        + 'VALUES($1, $2, $3, $4, NOW()::timestamp) returning solution_id;' ;
    await client.query(
        queryText,
        [ studentID, propositionID, studentSolution, correctSolution ]
    );

  } catch (err) {
    console.error(err.stack);
  }
};

const saveUser = async (github_id, user_name, client ) => {
  try {
    const queryText =
        'INSERT INTO users(github_id, user_name, is_admin)'
        + 'VALUES($1, $2, FALSE) ON CONFLICT DO NOTHING;'
    await client.query(
        queryText,
        [ github_id, user_name]
    );

  } catch (err) {
    console.error(err.stack);
  }
};

const updateAdmins = async (name, is_admin, client) => {
  try {
    const queryText =
        'UPDATE users SET  is_admin = $2'
        + 'WHERE  user_name = $1;' ;
    await client.query(
        queryText,
        [ name, is_admin]
    );

  } catch (err) {
    console.error(err.stack);
  }
};

const updateExercise = async (exercise, client) => {
  try {
    const queryText =
        'UPDATE exercises SET title = $2, description = $3, constants = $4, predicates = $5, functions = $6, constraints = $7'
        + 'WHERE  exercise_id = $1;' ;
    await client.query(
        queryText,
        [ exercise.id, exercise.title, exercise.description, exercise.constants, exercise.predicates, exercise.functions, exercise.constraint,]
    );
   await removeProposition(exercise.id, client);
    for(let i = 0; i < exercise.propositions.length; i++){
      await saveProposition(exercise.id,
          {"proposition": exercise.propositions[i].proposition,
            "formalizations": exercise.propositions[i].formalizations, "constraints": exercise.propositions[i].constraints}, client)
    }

  } catch (err) {
    console.error(err.stack);
  }
};

const removeProposition = async (exercise_id) => {
  try {
    const queryText =
        'DELETE FROM propositions WHERE exercise_id = $1;';
    await pool.query(
        queryText,
        [ exercise_id]
    );
  } catch (err) {
    console.error(err.stack);
  }
};

const removeExercise = async (exercise, client) => {
  try {
    const queryText =
        'DELETE FROM exercises WHERE exercise_id = $1;';
    await client.query(
        queryText,
        [ exercise.id]
    );
  } catch (err) {
    console.error(err.stack);
  }
};


module.exports = {
  saveExercise,
  saveSolution,
  saveUser,
  updateAdmins,
  updateExercise,
  removeProposition,
  removeExercise

};
