import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, type Category, type Task, type Me } from "../lib/api";
import { loginHref } from "../lib/config";
import { useMode } from "../lib/mode";
import Provider from "./Provider";

function CategoryGrid() {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
  }, []);
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Popular categories</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cats.map((c) => (
          <Link key={c.id} to={`/tasks?category=${c.id}`} className="card text-center hover:border-brand-500">
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Logged-out: state both intents up front so the first screen serves either visitor. */
function SplitHero() {
  return (
    <div>
      <section className="py-8 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Local help, from your neighbors.</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600 dark:text-gray-300">
          Post a task and get responses from nearby people and pros — or find local work to do. Free to start.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card flex flex-col items-center text-center">
          <h2 className="text-xl font-bold">Need a hand?</h2>
          <p className="mt-1 flex-1 text-sm text-gray-600 dark:text-gray-300">
            Post what you need done. Neighbors and pros respond with questions and quotes.
          </p>
          <a href={loginHref()} className="btn-primary mt-4 w-full">Post a task</a>
        </div>
        <div className="card flex flex-col items-center text-center">
          <h2 className="text-xl font-bold">Want local work?</h2>
          <p className="mt-1 flex-1 text-sm text-gray-600 dark:text-gray-300">
            Browse jobs people near you need done and send a message or quote.
          </p>
          <a href={loginHref()} className="btn-secondary mt-4 w-full">See jobs near you</a>
        </div>
      </div>
      <CategoryGrid />
    </div>
  );
}

/** Signed-in "Get help" lens: clear primary action + your active tasks inline. */
function NeighborHome({ me }: { me: Me }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    api.get<{ tasks: Task[] }>("/api/my-tasks").then((d) => setTasks(d.tasks)).catch(() => {});
  }, []);
  const active = tasks.filter((t) => t.status === "open" || t.status === "assigned");

  return (
    <div>
      <section className="py-6 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {me.name ? `Hi ${me.name.split(" ")[0]} — ` : ""}need something done?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600 dark:text-gray-300">
          Post a task and nearby neighbors and pros will respond.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/post-task" className="btn-primary w-full sm:w-auto">Post a task</Link>
          <Link to="/tasks" className="btn-secondary w-full sm:w-auto">Browse local jobs</Link>
        </div>
      </section>

      {active.length ? (
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your active tasks</h2>
            <Link to="/my-tasks" className="text-sm text-brand-600 hover:underline">See all</Link>
          </div>
          <div className="mt-3 space-y-3">
            {active.slice(0, 3).map((t) => (
              <Link key={t.id} to={`/tasks/${t.slug}`} className="card block hover:border-brand-500">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t.title}</h3>
                  <span className="text-xs uppercase text-gray-400">{t.status}</span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{t.category_name}{t.budget_cents !== null ? ` · ${money(t.budget_cents)}` : ""}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <CategoryGrid />
    </div>
  );
}

export default function Home({ me }: { me: Me | null }) {
  const { mode } = useMode();
  if (!me) return <SplitHero />;
  if (mode === "provider") return <Provider me={me} />;
  return <NeighborHome me={me} />;
}
