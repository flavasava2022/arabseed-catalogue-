const { getMovies } = require('./scrapers/movies');

async function test() {
  console.log('Testing movie scraper...\n');
  const movies = await getMovies(0);
  console.log('\n=== Final result:', movies.length, 'movies');
  if (movies.length > 0) {
    console.log('\nFirst movie:', JSON.stringify(movies[0], null, 2));
  }
}

test();
