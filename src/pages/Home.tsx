import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Category } from "../lib/api";

export default function Home() {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
  }, []);

  return (
    <div>
      <section className="py-8 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Post a local job. Get responses from nearby people and businesses.</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600 dark:text-gray-300">
          BidNeighbor connects you with people and pros in your county. Free to post.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/post-task" className="btn-primary w-full sm:w-auto">Post a task</Link>
          <Link to="/tasks" className="btn-secondary w-full sm:w-auto">Browse local jobs</Link>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Popular categories</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cats.map((c) => (
            <Link key={c.id} to={`/tasks?category=${c.id}`} className="card text-center hover:border-brand-500">
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
