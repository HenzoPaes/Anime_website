import { Anime } from 'an-anime-scraper';

const anime = new Anime("gogoanime.ai");
anime.searchAnime("Naruto").then(list => {
  console.log(list);
});   