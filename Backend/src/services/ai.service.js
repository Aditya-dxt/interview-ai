const { GoogleGenerativeAI } = require("@google/generative-ai")
const OpenAI = require("openai")
const PDFDocument = require("pdfkit")

// ============================================================================
// AI CLIENT INITIALIZATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

// Lazily initialize OpenAI client only when needed (avoids crash if API key is missing)
let _openaiClient = null
function getOpenAIClient() {
    if (!_openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey || apiKey === "your_openai_api_key_here") {
            throw new Error("OpenAI API key not configured")
        }
        _openaiClient = new OpenAI({ apiKey })
    }
    return _openaiClient
}

// ============================================================================
// SHARED ENHANCED PROMPT
// ============================================================================

function buildEnhancedPrompt({ resume, selfDescription, jobDescription }) {
    return `
You are an expert AI interview coach and senior technical recruiter.

Analyze the candidate profile and generate a COMPLETE professional interview preparation report.

IMPORTANT:
- Return ONLY valid JSON
- No markdown
- No explanation text
- No triple backticks

JSON FORMAT:

{
  "title": "realistic professional job title",
  "matchScore": 0-100,
  "technicalQuestions": [
    {
      "question": "",
      "intention": "",
      "modelAnswer": "",
      "difficulty": "easy|medium|hard"
    }
  ],
  "behavioralQuestions": [
    {
      "question": "",
      "intention": "",
      "modelAnswer": "",
      "category": "leadership|teamwork|problem-solving|communication|conflict-resolution|adaptability|ownership|time-management"
    }
  ],
  "skillGaps": [
    {
      "skill": "",
      "severity": "low|medium|high",
      "description": "",
      "recommendation": ""
    }
  ],
  "preparationPlan": [
    {
      "day": 1,
      "focus": "",
      "tasks": ["", "", "", ""]
    }
  ]
}

REQUIREMENTS:

1. Generate a realistic professional job title based on the job description.

2. Generate a match score from 0-100 based on how well the candidate's resume and self-description match the job requirements.

3. Generate 8 HIGH QUALITY technical interview questions:
   - Role-specific and practical
   - Detailed model answers with real-world depth
   - Assign difficulty: easy, medium, or hard
   - Cover core skills mentioned in the job description

4. Generate 8 behavioral interview questions:
   - STAR format style answers (Situation, Task, Action, Result)
   - Cover: leadership, teamwork, problem-solving, communication, conflict-resolution, adaptability, ownership, time-management
   - Each question should have a category from the list above

5. Generate 6 realistic skill gaps:
   - Each gap should include why it matters (description) and how to close it (recommendation)
   - Severity: high for core required skills, medium for preferred, low for nice-to-have

6. Generate a DETAILED 7-day preparation plan:
   - Each day has a number (1-7), a focus area, and 4-5 specific actionable tasks
   - Day 1: Fundamentals review
   - Day 2-3: Core technical skills practice
   - Day 4-5: Advanced topics and system design
   - Day 6: Behavioral and soft skills prep
   - Day 7: Mock interviews and final review

Candidate Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}
`
}

// ============================================================================
// RESPONSE CLEANING & MAPPING
// ============================================================================

function cleanAndParseAIResponse(text) {
    const cleanedText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()

    const parsedData = JSON.parse(cleanedText)

    // Map modelAnswer → answer to match the Mongoose schema
    const technicalQuestions = (parsedData.technicalQuestions || []).map(q => ({
        question: q.question,
        intention: q.intention,
        answer: q.modelAnswer || q.answer || "",
        difficulty: q.difficulty || "medium"
    }))

    const behavioralQuestions = (parsedData.behavioralQuestions || []).map(q => ({
        question: q.question,
        intention: q.intention,
        answer: q.modelAnswer || q.answer || "",
        category: q.category || ""
    }))

    const skillGaps = (parsedData.skillGaps || []).map(g => ({
        skill: g.skill,
        severity: g.severity || "medium",
        description: g.description || "",
        recommendation: g.recommendation || ""
    }))

    const preparationPlan = (parsedData.preparationPlan || []).map(p => ({
        day: p.day,
        focus: p.focus || p.title || "",
        tasks: p.tasks || p.topics || []
    }))

    return {
        title: parsedData.title || "Software Developer",
        matchScore: parsedData.matchScore || 75,
        technicalQuestions,
        behavioralQuestions,
        skillGaps,
        preparationPlan
    }
}

// ============================================================================
// TIER 1: GEMINI (PRIMARY)
// ============================================================================

async function tryGemini({ resume, selfDescription, jobDescription }) {
    console.log("[AI Fallback Chain] TIER 1: Attempting Gemini (gemini-2.0-flash)...")

    const prompt = buildEnhancedPrompt({ resume, selfDescription, jobDescription })
    const result = await geminiModel.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    console.log("[AI Fallback Chain] TIER 1: Gemini response received, parsing...")

    const parsed = cleanAndParseAIResponse(text)

    console.log("[AI Fallback Chain] TIER 1: Gemini SUCCESS ✓")
    return { ...parsed, aiProvider: "gemini" }
}

// ============================================================================
// TIER 2: OPENAI (FALLBACK)
// ============================================================================

async function tryOpenAI({ resume, selfDescription, jobDescription }) {
    console.log("[AI Fallback Chain] TIER 2: Attempting OpenAI (gpt-4o-mini)...")

    const prompt = buildEnhancedPrompt({ resume, selfDescription, jobDescription })

    const completion = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "user", content: prompt }
        ]
    })

    const text = completion.choices[0].message.content

    console.log("[AI Fallback Chain] TIER 2: OpenAI response received, parsing...")

    const parsed = cleanAndParseAIResponse(text)

    console.log("[AI Fallback Chain] TIER 2: OpenAI SUCCESS ✓")
    return { ...parsed, aiProvider: "openai" }
}

// ============================================================================
// TIER 3: INTELLIGENT LOCAL FALLBACK
// ============================================================================

// ---------------------------------------------------------------------------
// Comprehensive curated skill map with technical questions
// ---------------------------------------------------------------------------
const SKILL_DATABASE = {
    // --- JavaScript ---
    javascript: {
        displayName: "JavaScript",
        category: "frontend",
        questions: [
            {
                question: "Explain closures in JavaScript and provide a practical use case.",
                intention: "Tests understanding of lexical scoping and one of JavaScript's most fundamental concepts.",
                answer: "A closure is a function that retains access to its outer (enclosing) function's variables even after the outer function has returned. This happens because JavaScript functions form closures over their lexical scope. A practical use case is creating private variables: function createCounter() { let count = 0; return { increment: () => ++count, getCount: () => count }; }. The 'count' variable is private and can only be accessed through the returned methods. Closures are also used extensively in event handlers, callbacks, and module patterns.",
                difficulty: "medium"
            },
            {
                question: "What is the event loop in JavaScript and how does it handle asynchronous operations?",
                intention: "Assesses understanding of JavaScript's concurrency model and non-blocking I/O.",
                answer: "JavaScript is single-threaded but uses an event loop to handle asynchronous operations. The event loop continuously checks the call stack and the task queue. When the call stack is empty, it takes the first task from the microtask queue (Promises, queueMicrotask) first, then from the macrotask queue (setTimeout, setInterval, I/O). This allows JavaScript to perform non-blocking operations by offloading tasks to the browser/Node.js APIs, which push callbacks to the queue when complete. Understanding the event loop is crucial for avoiding race conditions and ensuring correct execution order.",
                difficulty: "hard"
            },
            {
                question: "What are the differences between var, let, and const in JavaScript?",
                intention: "Tests knowledge of variable declaration, scoping rules, and modern JavaScript best practices.",
                answer: "var is function-scoped, hoisted to the top of its function (initialized as undefined), and can be re-declared. let is block-scoped, hoisted but not initialized (temporal dead zone), and cannot be re-declared in the same scope. const is also block-scoped with the same hoisting behavior as let, but it cannot be reassigned after initialization. However, const objects and arrays can still have their properties/elements mutated. Best practice is to use const by default, let when reassignment is needed, and avoid var entirely in modern code.",
                difficulty: "easy"
            },
            {
                question: "Explain prototypal inheritance in JavaScript and how it differs from classical inheritance.",
                intention: "Tests deep understanding of JavaScript's object model and inheritance mechanism.",
                answer: "JavaScript uses prototypal inheritance where objects can inherit directly from other objects through the prototype chain. Every object has an internal [[Prototype]] link. When a property is accessed on an object, JavaScript walks up the prototype chain until it finds the property or reaches null. Unlike classical inheritance (e.g., Java), there are no classes at the language level (ES6 classes are syntactic sugar over prototypes). Key differences: prototypal inheritance is more flexible (objects inherit from objects, not classes), supports delegation rather than copying, and allows dynamic modification of the prototype chain at runtime. Object.create(), constructor functions, and ES6 classes are all ways to set up prototypal inheritance.",
                difficulty: "hard"
            }
        ]
    },

    // --- TypeScript ---
    typescript: {
        displayName: "TypeScript",
        category: "frontend",
        questions: [
            {
                question: "What are generics in TypeScript and when would you use them?",
                intention: "Tests understanding of TypeScript's type system and code reusability.",
                answer: "Generics allow you to write reusable components that work with multiple types while maintaining type safety. Instead of using 'any', generics preserve type information. For example: function identity<T>(arg: T): T { return arg; }. Use cases include: utility functions that work with different types, data structures like linked lists or stacks, API response wrappers, and React component props. Generics can also have constraints (extends keyword), defaults, and can be applied to interfaces, classes, and type aliases.",
                difficulty: "medium"
            },
            {
                question: "Explain the difference between 'type' and 'interface' in TypeScript.",
                intention: "Tests knowledge of TypeScript's type declaration options and when to use each.",
                answer: "Both 'type' and 'interface' can describe object shapes, but they have key differences. Interfaces support declaration merging (multiple declarations with the same name are merged), making them ideal for library definitions and extensible APIs. Types support union types, intersection types, mapped types, conditional types, and can alias primitives. Interfaces can extend other interfaces and classes. Types use intersections (&) for combining. Best practice: use interfaces for object shapes and public API contracts, use types for unions, intersections, and complex type transformations.",
                difficulty: "medium"
            },
            {
                question: "What is the 'unknown' type in TypeScript and how does it differ from 'any'?",
                intention: "Assesses knowledge of type safety practices in TypeScript.",
                answer: "Both 'unknown' and 'any' can hold any value, but 'unknown' is type-safe while 'any' bypasses all type checking. With 'unknown', you must narrow the type before performing operations on the value (using type guards like typeof, instanceof, or custom type predicates). With 'any', you can perform any operation without type checking, which defeats the purpose of TypeScript. 'unknown' is the type-safe counterpart of 'any' and should be preferred when the type is genuinely not known at compile time, such as parsing user input or API responses.",
                difficulty: "easy"
            }
        ]
    },

    // --- React ---
    react: {
        displayName: "React",
        category: "frontend",
        questions: [
            {
                question: "Explain the virtual DOM in React and how it improves performance.",
                intention: "Tests understanding of React's core rendering mechanism and optimization strategy.",
                answer: "The virtual DOM is a lightweight JavaScript representation of the actual DOM. When state changes occur, React creates a new virtual DOM tree and compares it with the previous one using a diffing algorithm (reconciliation). Only the minimal set of changes needed are applied to the real DOM, which is much faster than directly manipulating the DOM for every update. This batching and selective updating is what makes React performant for complex UIs.",
                difficulty: "medium"
            },
            {
                question: "What are React hooks rules, and why do they exist?",
                intention: "Tests understanding of hooks architecture and React's internal design constraints.",
                answer: "React hooks have two main rules: 1) Only call hooks at the top level — don't call them inside loops, conditions, or nested functions. 2) Only call hooks from React function components or custom hooks. These rules exist because React relies on the order in which hooks are called to maintain state between re-renders. React stores hook state in a linked list associated with each component. If hooks are called conditionally, the order might change between renders, causing state to be associated with the wrong hook. The ESLint plugin 'eslint-plugin-react-hooks' enforces these rules automatically.",
                difficulty: "medium"
            },
            {
                question: "How does useEffect work and what are common pitfalls?",
                intention: "Tests practical knowledge of side effects management in React components.",
                answer: "useEffect runs after the component renders and can optionally clean up before the component unmounts or before the effect re-runs. It takes a callback and an optional dependency array. Common pitfalls include: 1) Missing dependencies causing stale closures — the effect captures old values. 2) Infinite loops when setting state without proper dependencies. 3) Not returning a cleanup function for subscriptions/timers leading to memory leaks. 4) Using objects/arrays as dependencies without memoization (they're new references each render). 5) Forgetting that effects run after paint, not before (use useLayoutEffect for DOM measurements). Best practice: keep effects focused, extract complex logic into custom hooks.",
                difficulty: "medium"
            },
            {
                question: "Explain React's reconciliation algorithm and key prop importance.",
                intention: "Tests deep understanding of React's rendering optimization strategy.",
                answer: "React's reconciliation algorithm compares two virtual DOM trees to determine the minimum DOM operations needed. It uses two heuristics: 1) Elements of different types produce different trees (full remount). 2) Keys provide hints about which child elements are stable across renders. Without keys, React re-renders all children when the list changes. With keys, React can identify which items were added, removed, or moved, preserving component state and avoiding unnecessary re-renders. Using array index as key is problematic when items can be reordered, filtered, or inserted, as it causes incorrect state association and poor performance.",
                difficulty: "hard"
            }
        ]
    },

    // --- Angular ---
    angular: {
        displayName: "Angular",
        category: "frontend",
        questions: [
            {
                question: "Explain Angular's change detection mechanism and the difference between Default and OnPush strategies.",
                intention: "Tests understanding of Angular's performance optimization and rendering cycle.",
                answer: "Angular's change detection checks component trees for state changes and updates the DOM accordingly. The Default strategy checks every component in the tree on every event, timer, or HTTP response. OnPush strategy only checks a component when: 1) Its input references change (not deep equality). 2) An event originates from the component or its children. 3) An Observable linked via the async pipe emits. 4) Change detection is manually triggered. OnPush significantly improves performance by skipping unnecessary checks. Best practices include using immutable data patterns and the async pipe with OnPush components.",
                difficulty: "hard"
            },
            {
                question: "What is dependency injection in Angular and how does the injector hierarchy work?",
                intention: "Tests understanding of Angular's core architectural pattern for managing dependencies.",
                answer: "Dependency injection (DI) is a design pattern where components receive their dependencies rather than creating them. Angular has a hierarchical injector system: the root injector (providedIn: 'root' — singleton), module injectors, and element injectors (component-level). When a component requests a dependency, Angular walks up the injector tree until it finds a provider. This hierarchy enables features like lazy-loaded module scoping and component-level service instances. The @Injectable() decorator marks a class as injectable, and providers can be configured with useClass, useValue, useFactory, or useExisting.",
                difficulty: "medium"
            },
            {
                question: "What are Angular signals and how do they improve reactivity?",
                intention: "Tests knowledge of Angular's modern reactivity model introduced in Angular 16+.",
                answer: "Angular signals are a reactive primitive that tracks when values change and notifies consumers automatically. A signal is created with signal(initialValue) and read by calling it as a function. computed() creates derived signals that auto-update when dependencies change. effect() runs side effects when signal values change. Signals improve on zone.js-based change detection by enabling fine-grained reactivity: only components that actually depend on changed signals need to re-render, rather than checking the entire component tree. This leads to better performance and more predictable rendering behavior.",
                difficulty: "medium"
            }
        ]
    },

    // --- Vue ---
    vue: {
        displayName: "Vue.js",
        category: "frontend",
        questions: [
            {
                question: "Explain Vue's reactivity system and how it tracks dependencies.",
                intention: "Tests understanding of Vue's core reactive data binding mechanism.",
                answer: "Vue 3 uses JavaScript Proxies (Vue 2 used Object.defineProperty) to make data reactive. When a component renders, Vue tracks which reactive properties are accessed (dependency tracking). When a tracked property changes, Vue knows exactly which components need to re-render. The Composition API's ref() creates reactive references for primitives, while reactive() creates reactive objects. computed() creates cached derived values. watch() and watchEffect() allow explicit side-effect tracking. This fine-grained reactivity system is more efficient than virtual DOM diffing alone because Vue knows exactly what changed.",
                difficulty: "medium"
            },
            {
                question: "What is the Composition API and how does it compare to the Options API?",
                intention: "Tests knowledge of Vue's modern component organization pattern.",
                answer: "The Composition API (setup function or <script setup>) organizes code by logical concern rather than option type (data, methods, computed). Benefits: 1) Better code reuse through composable functions. 2) Better TypeScript support. 3) Logical concerns are co-located instead of spread across options. 4) More flexible than mixins (no naming conflicts, clear data flow). The Options API groups code by type (data, methods, watch, computed) which is easier for beginners but fragments logical concerns in complex components. Both APIs are fully supported and can even be mixed.",
                difficulty: "easy"
            }
        ]
    },

    // --- Node.js ---
    nodejs: {
        displayName: "Node.js",
        category: "backend",
        questions: [
            {
                question: "How does Node.js handle concurrent requests despite being single-threaded?",
                intention: "Tests understanding of Node.js architecture and its event-driven, non-blocking I/O model.",
                answer: "Node.js uses an event-driven, non-blocking I/O model built on libuv. While JavaScript code runs on a single thread, I/O operations (file system, network, database) are delegated to the libuv thread pool or OS-level async mechanisms (epoll, kqueue, IOCP). When an I/O operation completes, a callback is pushed to the event queue and processed by the event loop. This allows Node.js to handle thousands of concurrent connections efficiently. For CPU-intensive tasks, Node.js offers worker_threads module to run code on separate threads without blocking the main event loop.",
                difficulty: "medium"
            },
            {
                question: "Explain the difference between process.nextTick() and setImmediate() in Node.js.",
                intention: "Tests in-depth knowledge of the Node.js event loop phases.",
                answer: "process.nextTick() callbacks are processed after the current operation completes and before the event loop continues. They are stored in a separate queue that is drained completely before moving on. setImmediate() callbacks are executed in the 'check' phase of the event loop, after I/O events. Key difference: nextTick is processed before any I/O, while setImmediate is processed after. Recursive nextTick calls can starve I/O because the nextTick queue must be fully drained before proceeding, while recursive setImmediate allows I/O to process between callbacks. Best practice: use setImmediate for deferring unless you specifically need something to happen before I/O.",
                difficulty: "hard"
            },
            {
                question: "What is the Node.js streams API and when would you use it?",
                intention: "Tests knowledge of efficient data processing patterns in Node.js.",
                answer: "Streams are objects that let you read or write data piece by piece (chunks) instead of loading everything into memory at once. There are four types: Readable (e.g., fs.createReadStream), Writable (e.g., fs.createWriteStream), Duplex (both, e.g., TCP socket), and Transform (modifies data passing through, e.g., zlib compression). Use streams for: processing large files, real-time data processing, HTTP request/response bodies, piping data between sources. The pipe() method connects streams: readableStream.pipe(transformStream).pipe(writableStream). Streams handle backpressure automatically, preventing fast producers from overwhelming slow consumers.",
                difficulty: "medium"
            }
        ]
    },

    // --- Express ---
    express: {
        displayName: "Express.js",
        category: "backend",
        questions: [
            {
                question: "Explain middleware in Express.js and the order of execution.",
                intention: "Tests understanding of Express's core architectural pattern.",
                answer: "Middleware functions have access to the request, response, and next() function. They execute in the order they are defined (app.use). Types: application-level (app.use), router-level (router.use), error-handling (4 parameters: err, req, res, next), built-in (express.json(), express.static()), and third-party (cors, helmet). The next() function passes control to the next middleware. If next() is not called, the request hangs. Error-handling middleware catches errors by accepting 4 parameters. Middleware order matters: authentication should come before route handlers, error handlers should be last, and body parsers should be early in the chain.",
                difficulty: "medium"
            },
            {
                question: "How would you structure a large Express.js application for maintainability?",
                intention: "Tests architectural thinking and best practices for scalable backend applications.",
                answer: "A well-structured Express app uses separation of concerns: routes/ (route definitions), controllers/ (request handling logic), services/ (business logic), models/ (data models), middleware/ (auth, validation, error handling), config/ (environment variables, database connections), and utils/ (helper functions). Key practices: use Router for modular route files, keep controllers thin (delegate to services), centralize error handling with an error middleware, use environment variables for configuration, implement input validation (Joi/Zod), and follow the dependency injection pattern for testability. This layered architecture makes the codebase scalable and testable.",
                difficulty: "medium"
            }
        ]
    },

    // --- Python ---
    python: {
        displayName: "Python",
        category: "backend",
        questions: [
            {
                question: "Explain Python's GIL (Global Interpreter Lock) and its impact on multithreading.",
                intention: "Tests understanding of Python's concurrency limitations and workarounds.",
                answer: "The GIL is a mutex in CPython that allows only one thread to execute Python bytecode at a time. This means CPU-bound multithreaded Python programs don't achieve true parallelism. However, the GIL is released during I/O operations, so I/O-bound programs (web servers, file processing) benefit from threading. For CPU-bound parallelism, use multiprocessing (separate processes with their own GIL), C extensions that release the GIL, or alternative implementations like PyPy. asyncio provides concurrent I/O without threads using coroutines. Understanding the GIL is critical for choosing the right concurrency strategy.",
                difficulty: "hard"
            },
            {
                question: "What are Python decorators and how do they work?",
                intention: "Tests knowledge of Python's metaprogramming capabilities and function composition.",
                answer: "Decorators are functions that modify other functions' behavior. They take a function as input and return a new function (or modify the original). Syntax: @decorator above a function definition is equivalent to func = decorator(func). Common uses: logging, timing, authentication, caching (@functools.lru_cache), access control, and retry logic. Decorators can be stacked (@decorator1 @decorator2, applied bottom-up). functools.wraps preserves the original function's metadata. Class-based decorators implement __call__. Parametric decorators use nested functions: decorator_factory(params) returns the actual decorator.",
                difficulty: "medium"
            },
            {
                question: "What are list comprehensions and generator expressions in Python, and when should you use each?",
                intention: "Tests knowledge of Pythonic patterns and memory-efficient programming.",
                answer: "List comprehensions ([x*2 for x in range(10)]) create a complete list in memory. Generator expressions ((x*2 for x in range(10))) create a lazy iterator that yields values one at a time. Use list comprehensions when you need the full list (random access, multiple iterations, len()). Use generators when processing large datasets where memory is a concern — they compute values on-demand. Generators are ideal for pipelines: sum(x*2 for x in range(1000000)) uses constant memory regardless of input size. Generator functions (using yield) provide even more flexibility for complex iteration logic.",
                difficulty: "easy"
            }
        ]
    },

    // --- Django ---
    django: {
        displayName: "Django",
        category: "backend",
        questions: [
            {
                question: "Explain Django's ORM and the N+1 query problem with solutions.",
                intention: "Tests understanding of Django's database abstraction and performance optimization.",
                answer: "Django's ORM maps Python classes to database tables and handles SQL generation. The N+1 problem occurs when accessing related objects in a loop: the initial query fetches N objects, then each related access triggers an additional query. Solutions: select_related() for ForeignKey/OneToOne (SQL JOIN), prefetch_related() for ManyToMany/reverse ForeignKey (separate query + Python-side joining). Use django-debug-toolbar to identify N+1 queries. Other optimizations: only(), defer() for partial field loading, values(), values_list() for dictionaries/tuples instead of model instances, and Subquery/OuterRef for complex aggregations.",
                difficulty: "medium"
            },
            {
                question: "How does Django's middleware system work and what are common use cases?",
                intention: "Tests understanding of Django's request/response processing pipeline.",
                answer: "Django middleware are hooks that process requests/responses globally. Each middleware is a class with methods: __init__ (one-time setup), __call__ (called on every request), process_view (before view), process_exception (on errors), and process_template_response (for template responses). Middleware executes in order for requests (top-down in MIDDLEWARE setting) and reverse order for responses. Common middleware: SecurityMiddleware (HSTS, SSL redirect), SessionMiddleware, AuthenticationMiddleware, CsrfViewMiddleware, and custom middleware for logging, rate limiting, or request transformation.",
                difficulty: "medium"
            }
        ]
    },

    // --- Flask ---
    flask: {
        displayName: "Flask",
        category: "backend",
        questions: [
            {
                question: "Compare Flask and Django — when would you choose Flask over Django?",
                intention: "Tests understanding of Python web framework trade-offs and architectural decisions.",
                answer: "Flask is a micro-framework: lightweight, minimal core, and highly flexible. Django is a batteries-included framework with ORM, admin, auth, and more built-in. Choose Flask when: building microservices or APIs, you need maximum flexibility in component choices, the project is small-to-medium, you want to learn web fundamentals, or you need non-standard architecture. Choose Django for: full-featured web applications, rapid prototyping with admin interface, projects with complex data models, when you want convention over configuration. Flask uses extensions (Flask-SQLAlchemy, Flask-Login) to add functionality, giving you control over the tech stack.",
                difficulty: "easy"
            }
        ]
    },

    // --- Java ---
    java: {
        displayName: "Java",
        category: "backend",
        questions: [
            {
                question: "Explain the Java Memory Model and garbage collection mechanisms.",
                intention: "Tests understanding of JVM memory management, a critical topic for Java development.",
                answer: "The JVM memory is divided into: Heap (object storage, shared across threads — divided into Young Generation with Eden/Survivor spaces, and Old Generation), Stack (per-thread, stores local variables and method calls), Metaspace (class metadata, replaced PermGen in Java 8+). Garbage collection reclaims unreachable objects. Algorithms: Serial GC (single-threaded), Parallel GC (multi-threaded, throughput-focused), G1 GC (default since Java 9, balances latency and throughput with region-based collection), ZGC and Shenandoah (ultra-low latency, sub-millisecond pauses). Key concepts: GC roots, mark-and-sweep, generational hypothesis (most objects die young), and stop-the-world pauses.",
                difficulty: "hard"
            },
            {
                question: "What are Java Streams and how do they differ from collections?",
                intention: "Tests knowledge of Java's functional programming features and data processing pipelines.",
                answer: "Streams (java.util.stream) are a declarative way to process collections. Unlike collections (which store data), streams describe a pipeline of operations. Key differences: streams are lazy (intermediate operations like filter, map aren't executed until a terminal operation like collect, forEach), streams can be parallelized (parallelStream()), streams don't modify the source, and streams can only be consumed once. Operations chain: source → intermediate operations (filter, map, flatMap, sorted, distinct) → terminal operation (collect, reduce, count, forEach). Streams support functional programming patterns with lambda expressions and method references.",
                difficulty: "medium"
            },
            {
                question: "What is the difference between checked and unchecked exceptions in Java?",
                intention: "Tests understanding of Java's exception hierarchy and error handling philosophy.",
                answer: "Checked exceptions (extend Exception but not RuntimeException) must be either caught or declared in the method signature with 'throws'. They represent recoverable conditions like IOException, SQLException. Unchecked exceptions (extend RuntimeException) don't require explicit handling — they represent programming errors like NullPointerException, ArrayIndexOutOfBoundsException. Error (OutOfMemoryError, StackOverflowError) represents unrecoverable JVM conditions. Best practices: use checked exceptions for business logic errors the caller can handle, unchecked for programming bugs, and avoid using exceptions for flow control.",
                difficulty: "easy"
            }
        ]
    },

    // --- Spring ---
    spring: {
        displayName: "Spring",
        category: "backend",
        questions: [
            {
                question: "Explain Spring Boot's auto-configuration mechanism and how it works.",
                intention: "Tests understanding of Spring Boot's convention-over-configuration approach.",
                answer: "Spring Boot auto-configuration automatically configures beans based on classpath dependencies, existing beans, and property settings. It uses @EnableAutoConfiguration (included in @SpringBootApplication) which triggers META-INF/spring.factories scanning. Each auto-configuration class uses @Conditional annotations (@ConditionalOnClass, @ConditionalOnMissingBean, @ConditionalOnProperty) to only apply when conditions are met. For example, adding spring-boot-starter-data-jpa to the classpath automatically configures DataSource, EntityManagerFactory, and TransactionManager. You can exclude auto-configurations or override them by defining your own beans.",
                difficulty: "medium"
            },
            {
                question: "What is Spring's IoC container and how does it manage bean lifecycle?",
                intention: "Tests understanding of Spring's foundational Inversion of Control pattern.",
                answer: "Spring's IoC (Inversion of Control) container manages object creation, wiring, and lifecycle. The container reads configuration (annotations, XML, Java config) to create beans and inject dependencies. Bean lifecycle: instantiation → populate properties → BeanNameAware/BeanFactoryAware → BeanPostProcessor.postProcessBeforeInitialization → @PostConstruct/InitializingBean → BeanPostProcessor.postProcessAfterInitialization → ready for use → @PreDestroy/DisposableBean → destruction. Bean scopes: singleton (default, one per container), prototype (new instance each request), request, session, application (web-specific). Dependency injection via @Autowired (constructor preferred) keeps components loosely coupled and testable.",
                difficulty: "hard"
            }
        ]
    },

    // --- C++ ---
    cpp: {
        displayName: "C++",
        category: "systems",
        questions: [
            {
                question: "Explain RAII (Resource Acquisition Is Initialization) and smart pointers in modern C++.",
                intention: "Tests understanding of C++ memory management best practices.",
                answer: "RAII ties resource management to object lifetime: resources are acquired in constructors and released in destructors. When an object goes out of scope, its destructor automatically releases resources, even during exceptions. Smart pointers implement RAII for dynamic memory: unique_ptr (exclusive ownership, zero overhead, non-copyable, movable), shared_ptr (reference-counted shared ownership, thread-safe reference count), and weak_ptr (non-owning observer of shared_ptr, prevents circular references). Modern C++ best practice: use make_unique/make_shared, avoid raw new/delete, and prefer unique_ptr unless shared ownership is genuinely needed.",
                difficulty: "medium"
            },
            {
                question: "What are move semantics and rvalue references in C++11?",
                intention: "Tests knowledge of C++ performance optimization and resource management.",
                answer: "Move semantics allow transferring resources from temporary objects (rvalues) instead of copying them, which is significantly more efficient for objects managing heap memory, file handles, or other resources. Rvalue references (T&&) bind to temporary values. std::move casts an lvalue to an rvalue reference, enabling the move constructor/assignment operator. Example: vector<string> v1; vector<string> v2 = std::move(v1); — this transfers v1's internal buffer to v2 in O(1) instead of copying all elements. After moving, the source object is in a valid but unspecified state. The Rule of Five: if you define any of destructor, copy constructor, copy assignment, move constructor, or move assignment, define all five.",
                difficulty: "hard"
            }
        ]
    },

    // --- Go ---
    go: {
        displayName: "Go",
        category: "backend",
        questions: [
            {
                question: "Explain goroutines and channels in Go and how they enable concurrent programming.",
                intention: "Tests understanding of Go's concurrency primitives and CSP model.",
                answer: "Goroutines are lightweight threads managed by the Go runtime, not the OS. They start with the 'go' keyword and cost ~2KB of stack (vs ~1MB for OS threads). Channels are typed conduits for communication between goroutines, implementing CSP (Communicating Sequential Processes). Unbuffered channels synchronize sender/receiver; buffered channels allow async sending up to capacity. The select statement handles multiple channel operations. Key patterns: fan-out/fan-in, worker pools, pipeline, and context-based cancellation. Best practices: don't communicate by sharing memory, share memory by communicating. Use sync.WaitGroup for goroutine coordination and sync.Mutex only when channels are impractical.",
                difficulty: "medium"
            },
            {
                question: "How does Go handle error management and what are the best practices?",
                intention: "Tests understanding of Go's explicit error handling philosophy.",
                answer: "Go uses explicit error returns instead of exceptions. Functions return (result, error) pairs, and callers must check errors. The error interface has a single method: Error() string. Best practices: wrap errors with fmt.Errorf('context: %w', err) for context (Go 1.13+), use errors.Is() and errors.As() for checking wrapped errors, create sentinel errors (var ErrNotFound = errors.New('not found')) for comparison, use custom error types for structured error data. Panic/recover exists for truly unrecoverable situations (like programmer errors), not for normal error handling. The errors package and pkg/errors provide stack traces and wrapping utilities.",
                difficulty: "medium"
            }
        ]
    },

    // --- Rust ---
    rust: {
        displayName: "Rust",
        category: "systems",
        questions: [
            {
                question: "Explain Rust's ownership system and how it prevents memory safety issues.",
                intention: "Tests understanding of Rust's core innovation in memory management.",
                answer: "Rust's ownership system enforces three rules at compile time: 1) Each value has exactly one owner. 2) When the owner goes out of scope, the value is dropped. 3) You can have either one mutable reference OR any number of immutable references (but not both simultaneously). This prevents: dangling pointers (lifetimes ensure references are valid), data races (borrowing rules prevent concurrent mutation), double-free (single ownership), and use-after-free. Ownership can be transferred (move) or temporarily lent (borrowing with & or &mut). The borrow checker enforces these rules at compile time with zero runtime cost.",
                difficulty: "hard"
            }
        ]
    },

    // --- SQL ---
    sql: {
        displayName: "SQL",
        category: "database",
        questions: [
            {
                question: "Explain the different types of SQL JOINs with examples.",
                intention: "Tests fundamental database query knowledge and ability to combine data from multiple tables.",
                answer: "INNER JOIN returns rows where both tables have matching values. LEFT JOIN returns all rows from the left table plus matches from the right (NULLs for non-matches). RIGHT JOIN is the opposite. FULL OUTER JOIN returns all rows from both tables (NULLs where no match). CROSS JOIN returns the Cartesian product (every combination). SELF JOIN joins a table with itself (e.g., employee-manager hierarchy). Example: SELECT e.name, d.department FROM employees e INNER JOIN departments d ON e.dept_id = d.id; Performance tips: ensure JOIN columns are indexed, prefer INNER JOIN when possible, and avoid JOINs on computed columns.",
                difficulty: "easy"
            },
            {
                question: "What are database indexes, how do they work, and what are the trade-offs?",
                intention: "Tests understanding of database performance optimization fundamentals.",
                answer: "Indexes are data structures (typically B-trees or hash tables) that speed up data retrieval by providing efficient lookup paths. A B-tree index maintains sorted data enabling O(log n) lookups, range queries, and ordered retrieval. Types: single-column, composite (multi-column, order matters), unique, partial (filtered), covering (includes all queried columns). Trade-offs: indexes speed up reads but slow down writes (INSERT, UPDATE, DELETE must update indexes), consume additional storage, and require maintenance. Best practices: index columns used in WHERE, JOIN, ORDER BY; use EXPLAIN to verify index usage; avoid over-indexing; consider covering indexes for frequent queries.",
                difficulty: "medium"
            },
            {
                question: "Explain database normalization and when you might choose to denormalize.",
                intention: "Tests database design knowledge and ability to make architectural trade-offs.",
                answer: "Normalization organizes data to reduce redundancy and improve integrity. 1NF: atomic values, no repeating groups. 2NF: 1NF + no partial dependencies (all non-key columns depend on the full primary key). 3NF: 2NF + no transitive dependencies. BCNF: every determinant is a candidate key. Denormalization intentionally introduces redundancy for performance. Use denormalization when: read performance is critical and writes are infrequent, JOIN operations are expensive (large tables, complex queries), caching materialized views, or in NoSQL databases. Common denormalization techniques: pre-computed aggregates, duplicated columns, summary tables, and materialized views.",
                difficulty: "medium"
            }
        ]
    },

    // --- PostgreSQL ---
    postgresql: {
        displayName: "PostgreSQL",
        category: "database",
        questions: [
            {
                question: "What are PostgreSQL's JSONB capabilities and when would you use them vs a NoSQL database?",
                intention: "Tests knowledge of PostgreSQL's hybrid relational/document capabilities.",
                answer: "PostgreSQL's JSONB stores JSON in a binary format supporting indexing, querying, and manipulation. Key operators: -> (get JSON object field), ->> (get as text), @> (contains), ? (key exists). GIN indexes on JSONB columns enable fast queries. Use JSONB when: data has a known relational core with variable attributes (e.g., product metadata), you need ACID transactions with flexible schema, or you want to avoid managing a separate NoSQL database. Prefer dedicated NoSQL (MongoDB, DynamoDB) when: the entire data model is document-oriented, you need horizontal sharding at massive scale, or you need specialized features like change streams or TTL indexes.",
                difficulty: "medium"
            }
        ]
    },

    // --- MongoDB ---
    mongodb: {
        displayName: "MongoDB",
        category: "database",
        questions: [
            {
                question: "Explain MongoDB's aggregation pipeline and common stages used in data processing.",
                intention: "Tests knowledge of MongoDB's powerful data transformation framework.",
                answer: "The aggregation pipeline processes documents through sequential stages. Common stages: $match (filter documents, like WHERE), $group (aggregate by fields with accumulators: $sum, $avg, $push), $project (reshape documents, include/exclude fields), $sort (order results), $limit/$skip (pagination), $unwind (deconstruct arrays into separate documents), $lookup (left outer join with another collection), $addFields (add computed fields), $facet (multiple parallel pipelines). Pipeline optimization: place $match early to reduce documents processed, use indexes with $match and $sort, consider $merge for materialized views. Example: db.orders.aggregate([{$match: {status: 'completed'}}, {$group: {_id: '$customer', total: {$sum: '$amount'}}}])",
                difficulty: "medium"
            },
            {
                question: "How does MongoDB handle transactions and what are the limitations?",
                intention: "Tests understanding of MongoDB's ACID compliance and consistency model.",
                answer: "MongoDB supports multi-document ACID transactions since version 4.0 (replica sets) and 4.2 (sharded clusters). Transactions span multiple operations, collections, and databases. Usage: const session = client.startSession(); session.startTransaction(); try { ...operations with {session}... await session.commitTransaction(); } catch { await session.abortTransaction(); }. Limitations: transactions have a 60-second time limit by default, they incur performance overhead compared to single-document operations, and they don't work well across shards for very high-throughput use cases. Best practice: design your schema to minimize the need for multi-document transactions by embedding related data in single documents when possible.",
                difficulty: "hard"
            },
            {
                question: "What are MongoDB indexes and how do you optimize query performance?",
                intention: "Tests practical knowledge of MongoDB performance tuning.",
                answer: "MongoDB indexes use B-tree structures (WiredTiger engine) to speed up queries. Types: single field, compound (order matters for query optimization), multikey (array fields), text (full-text search), geospatial (2d, 2dsphere), hashed (for sharding). Use explain('executionStats') to analyze query plans. Key metrics: totalDocsExamined vs nReturned (closer = better), IXSCAN vs COLLSCAN stage. Optimization strategies: create compound indexes matching query patterns (ESR rule: Equality, Sort, Range), use covered queries (projection only includes indexed fields), avoid $regex with non-anchored patterns, use hint() to force index usage. Monitor with db.currentOp() and profiler.",
                difficulty: "medium"
            }
        ]
    },

    // --- Redis ---
    redis: {
        displayName: "Redis",
        category: "database",
        questions: [
            {
                question: "Explain Redis data structures and common use cases for each.",
                intention: "Tests knowledge of Redis beyond simple key-value caching.",
                answer: "Redis supports rich data structures: Strings (caching, counters, distributed locks), Lists (message queues, activity feeds, LPUSH/RPOP for FIFO), Sets (unique collections, tag systems, SINTER for common friends), Sorted Sets (leaderboards, priority queues, rate limiting with scores as timestamps), Hashes (object storage, user profiles — more memory-efficient than separate keys), Streams (event sourcing, message broker with consumer groups, like Kafka-lite), Bitmaps (feature flags, user activity tracking), HyperLogLog (cardinality estimation — count unique visitors with ~0.81% error using 12KB). Each structure has optimized operations with O(1) or O(log n) complexity.",
                difficulty: "medium"
            }
        ]
    },

    // --- Docker ---
    docker: {
        displayName: "Docker",
        category: "devops",
        questions: [
            {
                question: "Explain Docker layers, image caching, and best practices for writing Dockerfiles.",
                intention: "Tests practical Docker knowledge and optimization skills.",
                answer: "Docker images are built from layers, each corresponding to a Dockerfile instruction. Layers are cached and reused: if a layer hasn't changed, Docker uses the cached version. Best practices: 1) Order instructions from least to most frequently changing (COPY package.json before COPY source code). 2) Use multi-stage builds to separate build and runtime environments. 3) Minimize layer count by combining RUN commands with &&. 4) Use .dockerignore to exclude unnecessary files. 5) Pin base image versions for reproducibility. 6) Run as non-root user (USER directive). 7) Use HEALTHCHECK for container health monitoring. 8) Prefer COPY over ADD unless you need URL fetching or tar extraction.",
                difficulty: "medium"
            },
            {
                question: "What is the difference between Docker containers and virtual machines?",
                intention: "Tests understanding of containerization fundamentals and infrastructure concepts.",
                answer: "Containers and VMs both provide isolation but at different levels. VMs virtualize hardware: each VM runs a full guest OS with its own kernel, managed by a hypervisor (Type 1: bare-metal like VMware ESXi; Type 2: hosted like VirtualBox). Containers virtualize the OS: they share the host kernel and use Linux namespaces (PID, network, mount, user) and cgroups (CPU, memory limits) for isolation. Containers are lighter (MBs vs GBs), start faster (seconds vs minutes), and more resource-efficient. Trade-offs: VMs provide stronger isolation (separate kernel), support different OS types, and are better for running untrusted workloads. Containers are ideal for microservices, CI/CD, and consistent deployment environments.",
                difficulty: "easy"
            }
        ]
    },

    // --- Kubernetes ---
    kubernetes: {
        displayName: "Kubernetes",
        category: "devops",
        questions: [
            {
                question: "Explain Kubernetes pods, deployments, and services and how they relate to each other.",
                intention: "Tests understanding of Kubernetes core resource types and orchestration model.",
                answer: "Pods are the smallest deployable unit — one or more containers sharing network/storage. Deployments manage pod replicas declaratively: you specify the desired state (image, replicas, update strategy) and the deployment controller ensures the actual state matches. Rolling updates and rollbacks are built-in. Services provide stable networking for pods: ClusterIP (internal), NodePort (external on each node), LoadBalancer (cloud provider LB), and ExternalName (DNS alias). Services use label selectors to discover pods, providing load balancing and service discovery. The relationship: Deployment creates ReplicaSets which manage Pods, and Services route traffic to those Pods based on labels.",
                difficulty: "medium"
            }
        ]
    },

    // --- AWS ---
    aws: {
        displayName: "AWS",
        category: "cloud",
        questions: [
            {
                question: "Compare AWS Lambda, ECS, and EC2 — when would you use each?",
                intention: "Tests understanding of AWS compute options and architectural decision-making.",
                answer: "EC2: full virtual machines with complete OS control. Best for: long-running workloads, legacy applications, GPU computing, custom networking. You manage patching, scaling, and availability. ECS (with Fargate or EC2): managed container orchestration. Best for: microservices, consistent deployment, when you need more control than Lambda but less than EC2. Fargate is serverless containers (no server management). Lambda: serverless functions, event-driven, auto-scaling to zero. Best for: event processing, API backends with variable traffic, scheduled jobs, glue code between services. Limitations: 15-min timeout, cold starts, limited runtime customization. Decision factors: execution duration, cost model (pay-per-use vs reserved), operational overhead, scaling requirements, and existing architecture.",
                difficulty: "medium"
            },
            {
                question: "How would you design a highly available and fault-tolerant application on AWS?",
                intention: "Tests knowledge of cloud architecture patterns and AWS services.",
                answer: "Key strategies: Multi-AZ deployment (spread across availability zones for hardware fault tolerance), auto-scaling groups (handle traffic spikes), load balancers (ALB for HTTP, NLB for TCP — health checks remove unhealthy instances), RDS Multi-AZ (synchronous standby for database failover), ElastiCache for caching, S3 for durable storage (11 9's durability), CloudFront CDN for global distribution. Use Route53 with health checks for DNS failover, SQS for decoupling components (retry on failure), and SNS for notifications. Implement circuit breakers in application code, use structured logging with CloudWatch, set up alarms and dashboards. Design for failure: assume any component can fail and ensure graceful degradation.",
                difficulty: "hard"
            }
        ]
    },

    // --- Azure ---
    azure: {
        displayName: "Azure",
        category: "cloud",
        questions: [
            {
                question: "Compare Azure App Service, Azure Functions, and AKS for hosting web applications.",
                intention: "Tests understanding of Azure compute services and their trade-offs.",
                answer: "Azure App Service: PaaS for web apps, APIs, and mobile backends. Supports .NET, Java, Node.js, Python, PHP. Built-in CI/CD, SSL, custom domains, auto-scaling. Best for: traditional web apps needing easy deployment. Azure Functions: serverless, event-driven compute (similar to AWS Lambda). Consumption plan scales to zero; Premium plan avoids cold starts. Best for: event processing, microservices, scheduled tasks. Triggers: HTTP, timer, queue, blob, Cosmos DB. AKS (Azure Kubernetes Service): managed Kubernetes. Best for: complex microservice architectures, when you need container orchestration, multi-cloud portability, or fine-grained scaling control. Decision factors: team Kubernetes expertise, operational complexity tolerance, cost sensitivity, and application architecture.",
                difficulty: "medium"
            }
        ]
    },

    // --- GCP ---
    gcp: {
        displayName: "GCP",
        category: "cloud",
        questions: [
            {
                question: "What are GCP's key differentiators compared to AWS and Azure?",
                intention: "Tests breadth of cloud platform knowledge and ability to evaluate technology choices.",
                answer: "GCP's key strengths: 1) BigQuery: serverless data warehouse with blazing-fast SQL analytics at petabyte scale. 2) Kubernetes/GKE: Google created Kubernetes; GKE is the most mature managed K8s service. 3) Cloud Spanner: globally distributed, strongly consistent relational database. 4) TensorFlow/Vertex AI: best-in-class ML platform and TPUs for training. 5) Network: Google's premium-tier network for low latency. 6) Firebase: excellent mobile/web development platform. 7) Pricing: sustained-use discounts, per-second billing. Trade-offs: smaller market share means fewer third-party integrations, smaller talent pool, and fewer regions than AWS. GCP excels for data-intensive, ML, and container-native workloads.",
                difficulty: "medium"
            }
        ]
    },

    // --- CI/CD ---
    cicd: {
        displayName: "CI/CD",
        category: "devops",
        questions: [
            {
                question: "Describe a production CI/CD pipeline and the key stages involved.",
                intention: "Tests understanding of modern software delivery practices and automation.",
                answer: "A production CI/CD pipeline typically has these stages: 1) Source: triggered by git push/PR (GitHub Actions, GitLab CI, Jenkins). 2) Build: compile code, install dependencies, generate artifacts. 3) Test: unit tests, integration tests, code coverage check. 4) Static Analysis: linting (ESLint), type checking, security scanning (Snyk, SonarQube). 5) Build Artifact: create Docker image, push to registry. 6) Deploy to Staging: automatic deployment to staging environment. 7) E2E/Smoke Tests: run against staging. 8) Manual Approval: gate for production (optional). 9) Production Deployment: blue-green or canary strategy. 10) Post-deploy: health checks, monitoring, automatic rollback on failure. Key principles: fast feedback, reproducible builds, infrastructure as code, and immutable deployments.",
                difficulty: "medium"
            }
        ]
    },

    // --- Git ---
    git: {
        displayName: "Git",
        category: "devops",
        questions: [
            {
                question: "Explain Git rebase vs merge and when to use each.",
                intention: "Tests understanding of Git workflow strategies and their implications.",
                answer: "Merge creates a merge commit that combines two branches, preserving the complete history and branch structure. Rebase replays commits from one branch onto another, creating a linear history. Use merge when: working on shared branches (main, develop), you want to preserve the feature branch history, or during PR merges. Use rebase when: updating a feature branch with latest changes from main (rebase onto main), cleaning up local commits before pushing (interactive rebase: squash, fixup, reorder), or maintaining a clean linear history. Golden rule: never rebase commits that have been pushed to a shared branch — it rewrites history and causes conflicts for other developers. Interactive rebase (git rebase -i) is powerful for cleaning up commit history before PR submission.",
                difficulty: "medium"
            }
        ]
    },

    // --- REST API ---
    restapi: {
        displayName: "REST API",
        category: "architecture",
        questions: [
            {
                question: "What are the REST architectural constraints and how do you design a RESTful API?",
                intention: "Tests understanding of API design principles and REST architecture.",
                answer: "REST has six constraints: 1) Client-Server separation. 2) Stateless: each request contains all necessary information. 3) Cacheable: responses must define cacheability. 4) Uniform Interface: resource identification (URIs), manipulation through representations, self-descriptive messages, HATEOAS. 5) Layered System: client can't tell if connected directly to server. 6) Code-on-Demand (optional). Design best practices: use nouns for resources (GET /users, POST /orders), use HTTP methods correctly (GET read, POST create, PUT full update, PATCH partial, DELETE remove), use proper status codes (200, 201, 400, 401, 403, 404, 500), version your API (/v1/), implement pagination, filtering, and sorting, use HATEOAS for discoverability.",
                difficulty: "medium"
            },
            {
                question: "How would you implement API rate limiting and why is it important?",
                intention: "Tests knowledge of API security, reliability, and production hardening.",
                answer: "Rate limiting controls how many requests a client can make in a time window, protecting against abuse, DDoS, and ensuring fair resource allocation. Implementation strategies: 1) Token Bucket: tokens added at fixed rate, requests consume tokens. 2) Sliding Window: count requests in a rolling time window. 3) Fixed Window: count resets at interval boundaries. Tools: Redis (INCR with EXPIRE for distributed rate limiting), express-rate-limit middleware, API gateways (Kong, AWS API Gateway). Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After (on 429). Considerations: rate limit by API key, IP, or user; different limits for different endpoints; implement graceful degradation for internal services.",
                difficulty: "medium"
            }
        ]
    },

    // --- GraphQL ---
    graphql: {
        displayName: "GraphQL",
        category: "architecture",
        questions: [
            {
                question: "Compare GraphQL with REST and when would you choose one over the other?",
                intention: "Tests understanding of API paradigms and architectural trade-offs.",
                answer: "GraphQL: single endpoint, client specifies exact data needed (no over/under-fetching), strongly typed schema, built-in introspection, real-time subscriptions. REST: multiple endpoints per resource, server defines response shape, simpler caching (HTTP cache), easier to understand and debug. Choose GraphQL when: multiple clients need different data shapes (mobile vs web), the frontend team needs flexibility, you have deeply nested or interconnected data, or you want to aggregate multiple data sources. Choose REST when: caching is critical, the API is simple CRUD, you need file uploads, your team is more familiar with REST, or you want simpler monitoring/debugging. Common GraphQL challenges: N+1 queries (use DataLoader), query complexity limits, and caching (Apollo cache, persisted queries).",
                difficulty: "medium"
            }
        ]
    },

    // --- Microservices ---
    microservices: {
        displayName: "Microservices",
        category: "architecture",
        questions: [
            {
                question: "What are the key challenges of microservices architecture and how do you address them?",
                intention: "Tests understanding of distributed systems challenges and practical solutions.",
                answer: "Key challenges and solutions: 1) Service Communication: use async messaging (RabbitMQ, Kafka) for reliability, sync HTTP/gRPC for real-time needs. 2) Data Consistency: Saga pattern for distributed transactions (choreography or orchestration), eventual consistency, event sourcing. 3) Service Discovery: Consul, Eureka, or Kubernetes DNS. 4) Observability: distributed tracing (Jaeger, Zipkin), centralized logging (ELK stack), metrics (Prometheus/Grafana). 5) Failure Handling: circuit breaker (Hystrix, Resilience4j), retries with exponential backoff, bulkhead pattern. 6) Deployment Complexity: CI/CD per service, containerization, service mesh (Istio). 7) Testing: contract testing (Pact), integration test environments. Start monolith-first and extract microservices based on clear bounded contexts.",
                difficulty: "hard"
            }
        ]
    },

    // --- System Design ---
    systemdesign: {
        displayName: "System Design",
        category: "architecture",
        questions: [
            {
                question: "How would you design a URL shortener like bit.ly?",
                intention: "Tests system design thinking, scalability, and trade-off analysis.",
                answer: "Requirements: shorten URLs, redirect to original, analytics, high availability. Design: 1) API: POST /shorten {url} → {shortUrl}, GET /{code} → 301 redirect. 2) Short code generation: Base62 encoding of auto-incrementing ID (counter service with ranges for distribution) or hash-based (MD5/SHA256, take first 7 chars, handle collisions). 3) Storage: relational DB (PostgreSQL) for URL mappings, Redis cache for hot URLs. 4) Read-heavy optimization: cache frequently accessed URLs, use CDN for static redirects. 5) Scalability: horizontal scaling of stateless web servers, database sharding by short code hash, read replicas. 6) Analytics: async event processing with Kafka, store click data in time-series DB. 7) Reliability: database replication, rate limiting, input validation (check for malicious URLs). Estimated scale: ~100:1 read:write ratio.",
                difficulty: "hard"
            },
            {
                question: "Explain CAP theorem and its implications for distributed system design.",
                intention: "Tests understanding of fundamental distributed systems theory.",
                answer: "CAP theorem states a distributed system can guarantee at most two of three properties: Consistency (every read receives the most recent write), Availability (every request receives a response), Partition Tolerance (system operates despite network partitions). Since network partitions are inevitable in distributed systems, you effectively choose between CP and AP. CP systems (HBase, MongoDB with majority write concern, ZooKeeper): sacrifice availability during partitions, ensure strong consistency. AP systems (Cassandra, DynamoDB, CouchDB): sacrifice consistency during partitions, ensure availability with eventual consistency. PACELC extends CAP: even without partitions, there's a latency vs consistency trade-off. Real-world systems often make per-operation trade-offs rather than being purely CP or AP.",
                difficulty: "hard"
            }
        ]
    },

    // --- Data Structures ---
    datastructures: {
        displayName: "Data Structures",
        category: "cs-fundamentals",
        questions: [
            {
                question: "Compare hash tables and balanced BSTs — when would you use each?",
                intention: "Tests understanding of fundamental data structure trade-offs.",
                answer: "Hash tables: O(1) average for insert/search/delete, O(n) worst case with collisions. No ordering. BSTs (AVL, Red-Black): O(log n) guaranteed for all operations. Maintain sorted order. Use hash tables when: you need fast lookups by key, order doesn't matter, and you can design a good hash function (dictionaries, caches, deduplication). Use BSTs when: you need ordered traversal, range queries (find all elements between X and Y), floor/ceiling operations, or worst-case guarantees. In practice: hash maps are used for most key-value needs; BSTs/TreeMaps for sorted data, priority queues use heaps, and databases use B-trees (wide BSTs optimized for disk). Language implementations: JavaScript Map/Object (hash), Java TreeMap (Red-Black tree), Python dict (hash table).",
                difficulty: "medium"
            },
            {
                question: "Explain graph traversal algorithms BFS and DFS with their use cases.",
                intention: "Tests knowledge of fundamental graph algorithms and problem-solving approaches.",
                answer: "BFS (Breadth-First Search): explores level by level using a queue. Time: O(V+E). Use cases: shortest path in unweighted graphs, finding connected components, level-order traversal, web crawling, social network friend suggestions (degrees of separation). DFS (Depth-First Search): explores as deep as possible using a stack/recursion. Time: O(V+E). Use cases: cycle detection, topological sorting (dependency resolution), maze solving, connected components, path existence, strongly connected components (Tarjan's/Kosaraju's). Key differences: BFS finds shortest path (unweighted), DFS uses less memory for deep/narrow graphs. Both can detect cycles: BFS checks if a visited node is re-encountered in the current level; DFS uses coloring (white/gray/black) to detect back edges.",
                difficulty: "medium"
            }
        ]
    },

    // --- Algorithms ---
    algorithms: {
        displayName: "Algorithms",
        category: "cs-fundamentals",
        questions: [
            {
                question: "Explain dynamic programming and walk through solving the coin change problem.",
                intention: "Tests algorithmic problem-solving skills and ability to explain complex concepts clearly.",
                answer: "Dynamic programming (DP) solves problems by breaking them into overlapping subproblems and storing results to avoid recomputation. Two approaches: top-down (memoization: recursive with cache) and bottom-up (tabulation: iterative, build solution from smallest subproblems). Coin Change: given coins [1,5,10,25], find minimum coins for amount N. Define dp[i] = min coins for amount i. Base case: dp[0] = 0. Recurrence: dp[i] = min(dp[i - coin] + 1) for each coin ≤ i. Build table from 1 to N. Time: O(amount × coins), Space: O(amount). Key DP indicators: optimal substructure (optimal solution contains optimal sub-solutions) and overlapping subproblems (same subproblems solved repeatedly).",
                difficulty: "hard"
            },
            {
                question: "What is Big O notation and explain the common time complexities with examples.",
                intention: "Tests foundational understanding of algorithm analysis and performance.",
                answer: "Big O describes the upper bound of an algorithm's time/space growth as input size increases. Common complexities: O(1) — constant: hash table lookup, array access by index. O(log n) — logarithmic: binary search, balanced BST operations. O(n) — linear: array traversal, linear search. O(n log n) — linearithmic: merge sort, heap sort, efficient sorting. O(n²) — quadratic: nested loops, bubble sort, selection sort. O(2^n) — exponential: recursive Fibonacci without memoization, power set. O(n!) — factorial: permutations, brute-force TSP. Key concepts: we care about worst-case growth rate, drop constants and lower-order terms. Amortized analysis (e.g., dynamic array append is O(1) amortized despite occasional O(n) resizing).",
                difficulty: "easy"
            }
        ]
    },

    // --- Machine Learning / AI ---
    machinelearning: {
        displayName: "Machine Learning",
        category: "ai",
        questions: [
            {
                question: "Explain the bias-variance tradeoff and how it affects model selection.",
                intention: "Tests understanding of fundamental ML concepts and model evaluation.",
                answer: "Bias is the error from assumptions in the model (underfitting — too simple, misses patterns). Variance is the error from sensitivity to training data fluctuations (overfitting — too complex, learns noise). The tradeoff: reducing bias increases variance and vice versa. Total error = Bias² + Variance + Irreducible Error. High bias: linear regression on non-linear data. High variance: deep decision tree memorizing training data. Solutions: regularization (L1/L2 — controls complexity), cross-validation (detects overfitting), ensemble methods (Random Forest reduces variance via bagging, Gradient Boosting reduces bias via sequential correction), and proper train/validation/test splits. The goal is finding the sweet spot (optimal model complexity) where total error is minimized.",
                difficulty: "medium"
            },
            {
                question: "What is the difference between supervised, unsupervised, and reinforcement learning?",
                intention: "Tests knowledge of core ML paradigms and their applications.",
                answer: "Supervised Learning: labeled data (input-output pairs). The model learns to map inputs to outputs. Types: classification (spam detection, image recognition) and regression (price prediction, forecasting). Algorithms: linear/logistic regression, decision trees, SVM, neural networks. Unsupervised Learning: unlabeled data. The model discovers patterns and structure. Types: clustering (K-means, DBSCAN — customer segmentation), dimensionality reduction (PCA, t-SNE — visualization), anomaly detection. Reinforcement Learning: an agent learns by interacting with an environment, receiving rewards/penalties. Components: state, action, reward, policy. Applications: game AI (AlphaGo), robotics, recommendation systems, autonomous driving. Key differences: supervised needs labels (expensive to collect), unsupervised finds hidden patterns, RL learns optimal strategies through trial and error.",
                difficulty: "easy"
            }
        ]
    },

    // --- HTML/CSS ---
    html: {
        displayName: "HTML/CSS",
        category: "frontend",
        questions: [
            {
                question: "Explain CSS specificity and the cascade — how are style conflicts resolved?",
                intention: "Tests fundamental frontend knowledge of how browsers determine which styles to apply.",
                answer: "CSS specificity determines which rule wins when multiple rules target the same element. Specificity is calculated as (inline, ID, class/attribute/pseudo-class, element/pseudo-element): inline styles = 1,0,0,0; #id = 0,1,0,0; .class = 0,0,1,0; element = 0,0,0,1. Higher specificity wins. Equal specificity: later rule wins (cascade order). !important overrides specificity (avoid in production). The cascade order: 1) User agent styles, 2) User styles, 3) Author styles, 4) Author !important, 5) User !important. CSS layers (@layer) provide additional cascade control. Best practices: avoid !important, use BEM or CSS modules for predictable specificity, prefer classes over IDs for styling, and keep specificity low and consistent.",
                difficulty: "medium"
            }
        ]
    },

    // --- Tailwind CSS ---
    tailwind: {
        displayName: "Tailwind CSS",
        category: "frontend",
        questions: [
            {
                question: "What are the benefits and drawbacks of utility-first CSS frameworks like Tailwind?",
                intention: "Tests understanding of modern CSS approaches and architectural trade-offs.",
                answer: "Benefits: 1) No context switching between HTML and CSS files. 2) Consistent design tokens (spacing, colors via config). 3) No CSS bloat — PurgeCSS removes unused utilities. 4) Rapid prototyping. 5) No naming conventions needed (no BEM debates). 6) Responsive design with prefix modifiers (md:, lg:). 7) Highly customizable via tailwind.config.js. Drawbacks: 1) Verbose HTML with many classes. 2) Learning curve for utility names. 3) Harder to extract reusable component styles (mitigated by @apply or component libraries). 4) Can be harder to read for large elements. 5) Tight coupling of structure and presentation. Mitigations: use @apply for repeated patterns, create component abstractions, use Tailwind's plugin system for custom utilities.",
                difficulty: "easy"
            }
        ]
    },

    // --- Next.js ---
    nextjs: {
        displayName: "Next.js",
        category: "frontend",
        questions: [
            {
                question: "Explain the different rendering strategies in Next.js and when to use each.",
                intention: "Tests understanding of modern web rendering patterns and performance optimization.",
                answer: "Next.js offers multiple rendering strategies: 1) SSR (Server-Side Rendering): page generated on each request. Use for: personalized content, real-time data, SEO-critical pages with dynamic data. 2) SSG (Static Site Generation): page generated at build time. Use for: blogs, documentation, marketing pages — fastest option. 3) ISR (Incremental Static Regeneration): SSG with background revalidation. Use for: product pages, news — static performance with periodic updates. 4) CSR (Client-Side Rendering): fetched and rendered in browser. Use for: dashboards, authenticated pages, highly interactive features. 5) React Server Components (App Router): components render on server by default, 'use client' for interactive parts. Streaming with Suspense enables progressive loading. Choose based on data freshness needs, SEO requirements, and interactivity level.",
                difficulty: "medium"
            }
        ]
    },

    // --- Testing ---
    testing: {
        displayName: "Testing",
        category: "quality",
        questions: [
            {
                question: "Explain the testing pyramid and different types of tests with their trade-offs.",
                intention: "Tests understanding of software quality assurance strategy and test design.",
                answer: "The testing pyramid has three layers: Unit Tests (base, most numerous): test individual functions/classes in isolation. Fast, cheap, deterministic. Mock external dependencies. Tools: Jest, JUnit, pytest. Integration Tests (middle): test how components work together — API endpoints, database queries, service interactions. Slower but catch interface issues. Tools: Supertest, TestContainers. E2E Tests (top, fewest): test complete user flows through the actual application. Slowest, most brittle, most expensive, but catch real-world issues. Tools: Cypress, Playwright, Selenium. Additional types: contract tests (API compatibility), performance tests (load, stress), security tests (OWASP scanning). Best practice: heavy unit test coverage, selective integration tests for critical paths, minimal E2E for happy paths. Aim for fast feedback loops.",
                difficulty: "medium"
            }
        ]
    },

    // --- Jest ---
    jest: {
        displayName: "Jest",
        category: "quality",
        questions: [
            {
                question: "How do you test asynchronous code in Jest and what mocking strategies do you use?",
                intention: "Tests practical testing knowledge and ability to write reliable test suites.",
                answer: "Async testing in Jest: 1) Return a promise: return fetchData().then(data => expect(data).toBe('value')). 2) async/await: const data = await fetchData(); expect(data).toBe('value'). 3) Callbacks: use done parameter — fetchData(data => { expect(data).toBe('value'); done(); }). Mocking strategies: jest.fn() for mock functions (track calls, set return values), jest.mock('module') for module mocking, jest.spyOn() for spying on existing methods, manual mocks in __mocks__/ directory. Mock implementation: mockReturnValue, mockResolvedValue (async), mockImplementation. Best practices: mock external dependencies (APIs, databases), don't mock what you're testing, use mockClear/mockReset between tests, and prefer dependency injection for easier mocking.",
                difficulty: "medium"
            }
        ]
    },

    // --- Agile/Scrum ---
    agile: {
        displayName: "Agile/Scrum",
        category: "process",
        questions: [
            {
                question: "Describe the Scrum framework and the purpose of each ceremony.",
                intention: "Tests understanding of Agile software development methodology and team collaboration.",
                answer: "Scrum is an Agile framework with fixed-length sprints (typically 2 weeks). Roles: Product Owner (backlog management, prioritization), Scrum Master (process facilitation, impediment removal), Development Team (cross-functional, self-organizing). Ceremonies: 1) Sprint Planning: select and commit to backlog items, define sprint goal, break items into tasks. 2) Daily Standup (15 min): what I did, what I'll do, blockers. 3) Sprint Review: demo completed work to stakeholders, gather feedback. 4) Sprint Retrospective: reflect on process — what went well, what to improve, action items. Artifacts: Product Backlog (prioritized requirements), Sprint Backlog (committed items), Increment (potentially shippable product). Key principles: timeboxing, transparency, inspection, and adaptation.",
                difficulty: "easy"
            }
        ]
    },

    // --- Security ---
    security: {
        displayName: "Security",
        category: "security",
        questions: [
            {
                question: "Explain common web security vulnerabilities (OWASP Top 10) and how to prevent them.",
                intention: "Tests security awareness and ability to build secure applications.",
                answer: "Key OWASP vulnerabilities: 1) Injection (SQL, NoSQL, OS command): use parameterized queries, ORMs, input validation. 2) Broken Authentication: implement MFA, secure session management, bcrypt for passwords, JWT with short expiry. 3) XSS (Cross-Site Scripting): sanitize output, Content-Security-Policy headers, HttpOnly cookies. 4) CSRF: anti-CSRF tokens, SameSite cookies, verify Origin header. 5) Broken Access Control: implement RBAC, deny by default, validate on server side. 6) Security Misconfiguration: disable debug in production, remove default credentials, keep dependencies updated. 7) Sensitive Data Exposure: encrypt at rest and in transit (TLS), minimize data collection. Prevention framework: defense in depth, principle of least privilege, secure by default, input validation, output encoding, and regular security audits.",
                difficulty: "medium"
            }
        ]
    },

    // --- Performance ---
    performance: {
        displayName: "Performance",
        category: "quality",
        questions: [
            {
                question: "How would you diagnose and fix a slow web application?",
                intention: "Tests systematic approach to performance optimization and tooling knowledge.",
                answer: "Systematic approach: 1) Measure: use Lighthouse, WebPageTest, Chrome DevTools (Performance tab), and Core Web Vitals (LCP, FID, CLS). 2) Network: minimize requests (bundle, sprite), compress (gzip/brotli), use CDN, implement caching headers (Cache-Control, ETag), lazy load images/components. 3) JavaScript: code split (dynamic import), tree shake, defer non-critical scripts, optimize bundle size (webpack-bundle-analyzer), use Web Workers for CPU-intensive tasks. 4) Rendering: avoid layout thrashing, use CSS containment, reduce reflows, virtualize long lists (react-window). 5) Backend: database query optimization (indexes, EXPLAIN), implement caching (Redis), optimize N+1 queries, use connection pooling. 6) Infrastructure: horizontal scaling, load balancing, database read replicas. Monitor continuously with APM tools (New Relic, Datadog).",
                difficulty: "medium"
            }
        ]
    },

    // --- DevOps / Linux ---
    devops: {
        displayName: "DevOps",
        category: "devops",
        questions: [
            {
                question: "Explain Infrastructure as Code and compare Terraform with CloudFormation.",
                intention: "Tests understanding of modern infrastructure management practices.",
                answer: "Infrastructure as Code (IaC) manages infrastructure through declarative configuration files rather than manual processes. Benefits: version control, reproducibility, consistency across environments, automated provisioning, documentation as code. Terraform: cloud-agnostic, uses HCL (HashiCorp Configuration Language), maintains state file tracking resource mappings, supports multiple providers (AWS, Azure, GCP, Kubernetes) in a single configuration, plan/apply workflow shows changes before applying. CloudFormation: AWS-native, uses JSON/YAML, automatic state management integrated with AWS, deep AWS service integration (supports new services fastest), built-in rollback. Choose Terraform for multi-cloud or cloud-agnostic strategies. Choose CloudFormation for AWS-only shops wanting tighter AWS integration and no state file management.",
                difficulty: "medium"
            }
        ]
    },

    // --- Linux ---
    linux: {
        displayName: "Linux",
        category: "devops",
        questions: [
            {
                question: "Explain Linux process management and key commands for monitoring system performance.",
                intention: "Tests practical Linux administration and troubleshooting skills.",
                answer: "Linux processes: each has a PID, parent PID, state (running, sleeping, stopped, zombie). Key commands: ps aux (list all processes), top/htop (interactive process monitor — CPU, memory, load), kill PID (send SIGTERM), kill -9 PID (SIGKILL, force kill), nice/renice (priority adjustment), nohup (survive terminal close), systemctl (service management). Performance monitoring: free -m (memory usage), df -h (disk space), du -sh (directory size), iostat (disk I/O), netstat/ss (network connections), lsof (open files), strace (system call tracing), vmstat (virtual memory stats). System load: load average (1, 5, 15 min) — number of processes waiting for CPU. A load average equal to CPU cores means full utilization.",
                difficulty: "medium"
            }
        ]
    },

    // --- Mobile: React Native ---
    reactnative: {
        displayName: "React Native",
        category: "mobile",
        questions: [
            {
                question: "How does React Native bridge native and JavaScript code, and what are the performance implications?",
                intention: "Tests understanding of React Native's architecture and cross-platform trade-offs.",
                answer: "React Native's old architecture used an asynchronous bridge to serialize messages (JSON) between JavaScript and native threads. This bridge was a bottleneck for complex animations and frequent UI updates. The new architecture (Fabric + TurboModules + JSI) eliminates the bridge: JSI (JavaScript Interface) allows direct synchronous calls between JS and native C++ code without serialization. Fabric is the new rendering system supporting concurrent rendering and synchronous layout. TurboModules enable lazy loading of native modules. Performance implications: reduced memory usage, faster startup (lazy module loading), smoother animations (synchronous native calls), and better gesture handling. For optimal performance: use native driver for animations, avoid unnecessary re-renders, use FlatList for lists, and offload heavy computation to native modules.",
                difficulty: "hard"
            }
        ]
    },

    // --- Flutter ---
    flutter: {
        displayName: "Flutter",
        category: "mobile",
        questions: [
            {
                question: "Compare Flutter and React Native — what are the key architectural differences?",
                intention: "Tests knowledge of cross-platform mobile development trade-offs.",
                answer: "Flutter: uses Dart language, renders with its own engine (Skia/Impeller) — doesn't use platform UI components. Compiles to native ARM code. Benefits: pixel-perfect consistency across platforms, high performance (no bridge), rich built-in widget library, hot reload. Trade-offs: larger app size, Dart is less popular than JavaScript, platform-specific look requires extra effort. React Native: uses JavaScript, maps to actual native components via bridge/JSI. Benefits: uses native UI components (platform-authentic feel), large JavaScript ecosystem, reuse web knowledge, larger developer community. Trade-offs: performance overhead with bridge (improving with new architecture), platform differences in component behavior. Choose Flutter for: custom UI-heavy apps, consistent cross-platform appearance, performance-critical apps. Choose React Native for: apps that should feel native on each platform, teams with web/JS expertise.",
                difficulty: "medium"
            }
        ]
    },

    // --- Accessibility ---
    accessibility: {
        displayName: "Accessibility",
        category: "frontend",
        questions: [
            {
                question: "What are the key principles of web accessibility (WCAG) and how do you implement them?",
                intention: "Tests knowledge of inclusive design and accessibility best practices.",
                answer: "WCAG is built on four principles (POUR): 1) Perceivable: provide text alternatives for images (alt text), captions for videos, sufficient color contrast (4.5:1 for normal text), don't rely on color alone to convey information. 2) Operable: all functionality via keyboard, no keyboard traps, skip navigation links, sufficient time limits, no seizure-inducing content. 3) Understandable: clear language, consistent navigation, input error identification with suggestions. 4) Robust: valid HTML, proper ARIA attributes, compatible with assistive technologies. Implementation: semantic HTML (button not div, nav, main, article), ARIA labels when semantics are insufficient, focus management for SPAs, test with screen readers (NVDA, VoiceOver), automated testing (axe-core, Lighthouse accessibility audit), manual keyboard testing.",
                difficulty: "medium"
            }
        ]
    },

    // --- Webpack / Vite ---
    webpack: {
        displayName: "Webpack/Vite",
        category: "frontend",
        questions: [
            {
                question: "Compare Webpack and Vite — why has Vite gained popularity?",
                intention: "Tests knowledge of modern build tooling and frontend development experience.",
                answer: "Webpack: bundles all modules into one or more files using dependency graph traversal. Highly configurable with loaders and plugins. Mature ecosystem. Drawbacks: slow dev server startup (bundles everything upfront), complex configuration, slower HMR as project grows. Vite: uses native ES modules during development (no bundling needed), esbuild for dependency pre-bundling (10-100x faster than JS-based bundlers), and Rollup for production builds. Benefits: instant dev server startup (serves files on-demand), fast HMR regardless of project size, simple configuration, built-in TypeScript/JSX/CSS support. Why Vite is popular: dramatically better DX (developer experience) with near-instant feedback, minimal configuration, and comparable production build quality. Webpack is still relevant for complex configurations and legacy projects.",
                difficulty: "medium"
            }
        ]
    }
}

// Alias map for flexible matching
const SKILL_ALIASES = {
    "js": "javascript",
    "node": "nodejs",
    "node.js": "nodejs",
    "express.js": "express",
    "expressjs": "express",
    "ts": "typescript",
    "react.js": "react",
    "reactjs": "react",
    "vue.js": "vue",
    "vuejs": "vue",
    "angularjs": "angular",
    "c++": "cpp",
    "cplusplus": "cpp",
    "golang": "go",
    "postgres": "postgresql",
    "pg": "postgresql",
    "mongo": "mongodb",
    "k8s": "kubernetes",
    "amazon web services": "aws",
    "microsoft azure": "azure",
    "google cloud": "gcp",
    "google cloud platform": "gcp",
    "ci/cd": "cicd",
    "continuous integration": "cicd",
    "continuous deployment": "cicd",
    "rest": "restapi",
    "rest api": "restapi",
    "restful": "restapi",
    "ml": "machinelearning",
    "machine learning": "machinelearning",
    "artificial intelligence": "machinelearning",
    "ai/ml": "machinelearning",
    "css": "html",
    "sass": "html",
    "html5": "html",
    "css3": "html",
    "tailwindcss": "tailwind",
    "tailwind css": "tailwind",
    "next": "nextjs",
    "next.js": "nextjs",
    "nextjs": "nextjs",
    "vite": "webpack",
    "react native": "reactnative",
    "react-native": "reactnative",
    "data structures": "datastructures",
    "dsa": "datastructures",
    "system design": "systemdesign",
    "scrum": "agile",
    "django rest framework": "django",
    "drf": "django",
    "spring boot": "spring",
    "springboot": "spring"
}

// ---------------------------------------------------------------------------
// Curated behavioral questions (15+ comprehensive STAR-format)
// ---------------------------------------------------------------------------
const BEHAVIORAL_QUESTIONS = [
    {
        question: "Tell me about a time you had to debug a critical production issue under pressure.",
        intention: "Assesses problem-solving ability, composure under stress, and systematic debugging approach.",
        answer: "Situation: During a product launch, our payment processing service started returning 500 errors affecting 30% of transactions. Task: As the on-call engineer, I needed to identify and fix the issue within our 15-minute SLA. Action: I immediately checked the monitoring dashboard, identified the error spike correlated with a recent deployment, reviewed the deployment diff to find a database connection pool misconfiguration, rolled back the change, and verified the fix. Result: The issue was resolved in 12 minutes, within SLA. I then wrote a post-mortem document and implemented automated connection pool validation in our CI/CD pipeline to prevent similar issues.",
        category: "problem-solving"
    },
    {
        question: "Describe a situation where you had to lead a team through a significant technical challenge.",
        intention: "Evaluates leadership skills, technical decision-making, and ability to guide others.",
        answer: "Situation: Our team was tasked with migrating a monolithic application to microservices while maintaining zero downtime for 2M daily active users. Task: As tech lead, I needed to plan the migration strategy and coordinate the team of 6 engineers. Action: I designed a strangler fig pattern approach, breaking the migration into 8 two-week phases. I held architecture sessions to align the team, assigned each engineer ownership of specific services based on their strengths, set up feature flags for gradual traffic shifting, and established weekly migration reviews. Result: We completed the migration in 4 months with zero downtime incidents. System latency improved by 40%, and the team developed strong microservices expertise.",
        category: "leadership"
    },
    {
        question: "Tell me about a time you disagreed with a colleague on a technical approach. How did you resolve it?",
        intention: "Assesses conflict resolution, communication skills, and ability to collaborate constructively.",
        answer: "Situation: A senior colleague proposed using GraphQL for our new API, while I believed REST was more appropriate for our simple CRUD operations with limited frontend clients. Task: We needed to reach a consensus without delaying the project timeline. Action: I suggested we each prepare a brief technical comparison addressing our specific requirements: team expertise, client needs, caching requirements, and implementation timeline. We presented our cases to the team, using objective criteria. I acknowledged GraphQL's advantages for complex queries but demonstrated that our use case had straightforward data patterns. We agreed to a compromise: REST for the current phase with a GraphQL gateway planned for when client complexity increased. Result: The project launched on time, and the colleague and I developed a stronger working relationship built on mutual respect. Six months later, we did add GraphQL for new complex features.",
        category: "conflict-resolution"
    },
    {
        question: "Describe a time when you had to work effectively with a cross-functional team.",
        intention: "Tests teamwork, communication across disciplines, and collaborative problem-solving.",
        answer: "Situation: We were building a new onboarding flow that required close collaboration between engineering, design, product, and data analytics teams. Task: I was the engineering lead responsible for ensuring technical feasibility and timely delivery while meeting all stakeholders' needs. Action: I set up a shared Slack channel, created a living technical design document that non-engineers could understand, held bi-weekly sync meetings with all teams, and built interactive prototypes to validate design concepts early. When the design team proposed animations that would impact performance, I measured the impact and proposed optimized alternatives. I also worked with the data team to implement tracking events from the start. Result: The new onboarding flow launched with a 35% improvement in user activation rate. The cross-functional process became a template for future projects.",
        category: "teamwork"
    },
    {
        question: "Tell me about a time you had to communicate complex technical concepts to non-technical stakeholders.",
        intention: "Evaluates communication skills and ability to translate technical details for different audiences.",
        answer: "Situation: Our CTO asked me to present to the board of directors on why we needed to invest $500K in infrastructure modernization. Task: I needed to explain technical debt, containerization, and cloud migration in business terms that would justify the investment. Action: I created a presentation using analogies (technical debt as deferred maintenance on a building, containers as standardized shipping containers), included concrete business metrics (current downtime costs of $50K/month, projected 99.99% uptime after migration), showed competitor analysis, and prepared a clear ROI timeline. I avoided jargon, used visual diagrams, and prepared for likely questions. Result: The board approved the full budget. The CFO later told me it was the clearest technical presentation they'd received. The modernization reduced infrastructure costs by 30% within 6 months.",
        category: "communication"
    },
    {
        question: "Describe a situation where you had to quickly adapt to a major change in project requirements.",
        intention: "Assesses adaptability, flexibility, and ability to manage changing priorities.",
        answer: "Situation: Two weeks before launch, our main competitor released a feature nearly identical to what we were building. Product leadership decided to pivot our approach to differentiate. Task: I needed to redesign the architecture to support the new requirements while reusing as much existing work as possible. Action: I immediately assessed which components could be reused (about 60%), identified the new work needed, and proposed a revised timeline. I reorganized the team's tasks, broke the new features into small increments so we could release a differentiated MVP first and iterate. I worked extra hours to redesign the core data model and held daily standups to keep everyone aligned. Result: We launched the pivoted product only one week later than originally planned. The differentiated approach actually performed better in user testing, and the experience taught me to build more modular, adaptable architectures from the start.",
        category: "adaptability"
    },
    {
        question: "Tell me about a project where you took ownership beyond your defined responsibilities.",
        intention: "Tests ownership mentality, initiative, and willingness to go above and beyond.",
        answer: "Situation: I noticed our customer support team was spending 40% of their time on issues caused by confusing error messages in our application. Task: Although I was a backend developer and the error messages were in the frontend, I decided to take ownership of improving the overall user experience for error handling. Action: I analyzed support tickets to identify the top 20 most confusing errors, worked with the UX designer to create clear, actionable error messages, implemented a centralized error handling service that provided user-friendly messages and logged detailed technical errors for debugging. I also added contextual help links and created a troubleshooting guide. I presented the initiative to my manager as a cost-saving project. Result: Support tickets related to error confusion dropped by 65%, saving an estimated 15 hours per week of support time. The centralized error handling became a standard pattern across all our applications.",
        category: "ownership"
    },
    {
        question: "Describe a time when you had to manage multiple competing priorities with tight deadlines.",
        intention: "Evaluates time management, prioritization skills, and ability to deliver under pressure.",
        answer: "Situation: I was simultaneously working on a critical security patch (due in 2 days), a feature for an enterprise client (contractual deadline in 1 week), and mentoring a new team member. Task: I needed to deliver all three without sacrificing quality on any. Action: I first triaged by business impact: the security patch was highest priority (risk of data exposure). I spent the first day focused entirely on the patch, completing and deploying it. I then created a detailed task breakdown for the enterprise feature, identified components the new team member could work on with my guidance (combining mentoring with delivery), and handled the complex parts myself. I communicated revised timelines to stakeholders proactively and set clear daily goals. Result: The security patch was deployed on time with zero issues. The enterprise feature was delivered a day early. The new team member successfully contributed two components, accelerating their onboarding while helping meet the deadline.",
        category: "time-management"
    },
    {
        question: "Tell me about a time you identified and addressed a significant technical debt issue.",
        intention: "Tests proactive engineering mindset and ability to balance new features with code quality.",
        answer: "Situation: Our test suite had grown to take 45 minutes to run in CI, and flaky tests were causing engineers to ignore failures. Deployments were delayed, and code quality was declining. Task: I needed to make the case for dedicating time to fix the test infrastructure and improve developer productivity. Action: I collected data: average CI time, number of flaky test reruns per week, developer time spent waiting or investigating false failures. I calculated the cost: approximately 8 engineering hours per day lost to test-related delays. I proposed a 2-sprint initiative: parallelized test execution, identified and fixed 30 flaky tests, introduced test categorization (unit/integration/e2e) with selective running, and added test performance monitoring. Result: CI time dropped from 45 to 8 minutes, flaky test rate went from 15% to under 1%, and developer satisfaction scores improved. The team shipped 20% more features in the following quarter due to reduced friction.",
        category: "problem-solving"
    },
    {
        question: "Describe a time when you had to mentor or coach a struggling team member.",
        intention: "Evaluates mentoring ability, empathy, and investment in team growth.",
        answer: "Situation: A junior developer on my team was consistently missing deadlines and producing code with frequent bugs, and other team members were growing frustrated. Task: I needed to help the developer improve while maintaining team morale and productivity. Action: I had a private, empathetic conversation to understand the root cause — they were overwhelmed by the codebase complexity and afraid to ask questions. I set up daily 30-minute pair programming sessions, starting with smaller, well-defined tasks and gradually increasing complexity. I created a personal development plan with weekly goals, introduced them to effective debugging techniques, and encouraged them to ask questions publicly to normalize learning. I also adjusted sprint capacity to set realistic expectations. Result: Within 6 weeks, the developer's code review rejection rate dropped from 60% to 10%. They became one of the most improved team members and eventually started helping other new hires, paying forward the mentoring they received.",
        category: "leadership"
    },
    {
        question: "Tell me about a time when you had to make a difficult trade-off between speed and quality.",
        intention: "Assesses engineering judgment and ability to navigate competing priorities pragmatically.",
        answer: "Situation: A high-value enterprise client threatened to cancel their contract if a critical feature wasn't delivered within 3 weeks. The proper implementation required refactoring a legacy module, which would take 5 weeks. Task: I needed to find a way to deliver the feature on time without creating unsustainable technical debt. Action: I proposed a phased approach: Phase 1 (3 weeks) — implement the feature with an adapter layer over the legacy code, with clearly documented TODOs and automated tests ensuring the adapter's correctness. Phase 2 (post-deadline) — refactor the legacy module properly and remove the adapter. I communicated the trade-offs to both product (timeline vs future velocity) and engineering (temporary complexity with a firm cleanup commitment). I added the Phase 2 work to the next sprint's commitments. Result: The client received the feature on time and renewed their contract (worth $200K ARR). Phase 2 was completed in the following sprint, and the adapter pattern actually inspired a more general approach we used for other legacy integrations.",
        category: "ownership"
    },
    {
        question: "Describe a situation where you received critical feedback and how you handled it.",
        intention: "Tests self-awareness, growth mindset, and ability to accept and act on feedback.",
        answer: "Situation: During a performance review, my manager pointed out that I tended to jump into coding solutions before fully understanding requirements, leading to rework on two recent features. Task: I needed to acknowledge the feedback and develop better habits. Action: I thanked my manager for the honest feedback and asked for specific examples to fully understand the pattern. I implemented a personal rule: before writing any code, I would write a brief design document (even just bullet points) and get at least one review. I also started asking more questions during planning meetings and scheduling brief alignment calls with product managers before starting major tasks. I asked my manager to provide real-time feedback if they noticed me falling into the old pattern. Result: Over the next quarter, I had zero instances of rework due to misunderstood requirements. My design documents became a team best practice, and my manager highlighted my improvement as an example of growth mindset in the next team meeting.",
        category: "adaptability"
    },
    {
        question: "Tell me about a time you had to build consensus among a group with differing opinions.",
        intention: "Tests collaboration, diplomacy, and ability to drive alignment.",
        answer: "Situation: Our platform team was split on whether to adopt Kubernetes or stay with our existing ECS setup. Three senior engineers had strong, opposing views, and the debate had stalled progress for two weeks. Task: As the team lead, I needed to facilitate a decision that everyone could support. Action: I organized a structured evaluation: defined clear criteria (operational complexity, team expertise, migration cost, feature requirements, long-term scalability), had each advocate score both options against the criteria with evidence, and facilitated a time-boxed discussion. I ensured quieter team members had a voice by collecting written input beforehand. When scores were close, I proposed a small proof-of-concept on Kubernetes with a defined success criteria before committing. Result: The team agreed on the PoC approach, which revealed that Kubernetes met our needs but required more training investment. We decided on a gradual migration with a 3-month learning period. All three senior engineers felt heard and supported the final decision.",
        category: "communication"
    },
    {
        question: "Describe a time when you improved a process that made the entire team more efficient.",
        intention: "Tests process improvement thinking and impact-oriented mindset.",
        answer: "Situation: Our team's code review process was a bottleneck — PRs waited an average of 2 days for review, blocking development flow and causing merge conflicts. Task: I wanted to reduce the review wait time without compromising code quality. Action: I analyzed the bottleneck: reviews were ad-hoc, no one felt responsible for reviewing others' code promptly. I proposed and implemented several changes: a review rotation schedule (each day, two engineers were designated reviewers), PR size guidelines (max 400 lines), a 4-hour SLA for initial review response, automated checks (linting, tests, type checking) to reduce manual review burden, and a team agreement to prioritize reviews over new feature work in the morning. Result: Average review time dropped from 2 days to 4 hours, merge conflicts decreased by 80%, and team velocity improved by 25%. The process was adopted by three other teams in the engineering department.",
        category: "time-management"
    },
    {
        question: "Tell me about a time you had to work with an ambiguous or poorly defined project.",
        intention: "Assesses ability to navigate uncertainty and create structure from ambiguity.",
        answer: "Situation: Product leadership wanted to 'improve the search experience' but didn't have specific requirements, metrics, or designs. The search was used by 500K users monthly and was a core product feature. Task: I needed to define the problem, establish success criteria, and deliver meaningful improvements without clear direction. Action: I started by gathering data: analyzed search logs to identify top failing queries, surveyed users about pain points, benchmarked competitor search experiences, and discussed business goals with the product manager. From this research, I defined three specific problem statements with measurable KPIs (search result relevance score, click-through rate, zero-result rate). I proposed a phased approach and got stakeholder sign-off before coding. I built the first improvement (typo tolerance and synonym matching) as a quick win to build confidence. Result: Search click-through rate improved by 45%, zero-result queries decreased by 60%, and the structured approach became a template for future ambiguous projects. Product leadership praised the data-driven approach to defining the problem.",
        category: "conflict-resolution"
    }
]

// ---------------------------------------------------------------------------
// General CS/engineering questions (used when no specific skills match)
// ---------------------------------------------------------------------------
const GENERAL_QUESTIONS = [
    {
        question: "What is the difference between SQL and NoSQL databases, and when would you use each?",
        intention: "Tests understanding of database paradigms and architectural decision-making.",
        answer: "SQL databases (PostgreSQL, MySQL) are relational with structured schemas, ACID transactions, and powerful JOIN operations. Best for: complex queries, data integrity requirements, well-defined schemas, and financial applications. NoSQL databases come in several types: document (MongoDB — flexible schemas, rapid development), key-value (Redis — caching, sessions), column-family (Cassandra — time-series, high write throughput), and graph (Neo4j — relationship-heavy data). NoSQL offers horizontal scaling and schema flexibility. Choose SQL when data relationships are important and consistency is critical. Choose NoSQL when you need flexibility, horizontal scaling, or your data naturally fits a non-relational model. Many modern applications use polyglot persistence — multiple database types for different needs.",
        difficulty: "medium"
    },
    {
        question: "Explain SOLID principles and give an example of each.",
        intention: "Tests understanding of object-oriented design principles for maintainable code.",
        answer: "SOLID is five design principles: S — Single Responsibility: a class should have one reason to change (e.g., separate UserAuthentication from UserNotification). O — Open/Closed: open for extension, closed for modification (e.g., use strategy pattern instead of if-else chains). L — Liskov Substitution: subtypes must be substitutable for base types (e.g., Square extending Rectangle violates this if setWidth affects height). I — Interface Segregation: many specific interfaces are better than one general-purpose interface (e.g., IPrintable and IScannable instead of IMultiFunctionDevice). D — Dependency Inversion: depend on abstractions, not concrete implementations (e.g., inject ILogger interface instead of depending on FileLogger directly). Following SOLID leads to code that's easier to test, maintain, and extend.",
        difficulty: "medium"
    },
    {
        question: "What is caching and what strategies exist for maintaining cache consistency?",
        intention: "Tests knowledge of performance optimization and distributed systems concepts.",
        answer: "Caching stores frequently accessed data in fast storage (memory) to reduce latency and database load. Strategies: Cache-Aside (Lazy Loading): application checks cache first, loads from DB on miss, writes to cache. Simple but risks stale data. Write-Through: writes go to cache and DB simultaneously. Consistent but slower writes. Write-Behind (Write-Back): writes go to cache, asynchronously synced to DB. Fast writes but risk of data loss. Read-Through: cache sits in front of DB, automatically loads on miss. Cache invalidation strategies: TTL (time-based expiry), event-based invalidation (update cache when data changes), and versioning. Common issues: cache stampede (use locking or probabilistic early expiry), cold start (pre-warming), and memory limits (LRU/LFU eviction policies). Tools: Redis, Memcached, CDN for static assets.",
        difficulty: "medium"
    },
    {
        question: "What are design patterns and describe three commonly used ones?",
        intention: "Tests knowledge of software engineering design patterns and their practical applications.",
        answer: "Design patterns are reusable solutions to common software design problems. Three common patterns: 1) Observer Pattern: defines a one-to-many dependency where when one object (subject) changes state, all dependents (observers) are notified. Used in: event systems, pub/sub, React's state management. 2) Factory Pattern: encapsulates object creation logic, allowing subclasses to determine which class to instantiate. Used in: creating objects based on configuration, database driver selection, UI component factories. 3) Singleton Pattern: ensures a class has only one instance with a global access point. Used in: database connections, configuration managers, logging services. Caution: Singletons can make testing difficult and hide dependencies. Modern alternatives: dependency injection containers provide the same single-instance benefit with better testability.",
        difficulty: "medium"
    },
    {
        question: "How does HTTPS work and what role do SSL/TLS certificates play?",
        intention: "Tests understanding of web security fundamentals and encryption.",
        answer: "HTTPS uses TLS (Transport Layer Security) to encrypt HTTP communication. The TLS handshake: 1) Client sends ClientHello (supported cipher suites, TLS version). 2) Server responds with ServerHello (chosen cipher suite) and its certificate. 3) Client verifies the certificate against trusted Certificate Authorities (CA). 4) Key exchange: client and server establish a shared symmetric key using asymmetric encryption (e.g., ECDHE for forward secrecy). 5) Encrypted communication begins using the symmetric key (AES). Certificates contain: the server's public key, domain name, CA signature, and validity period. Certificate types: DV (domain validation), OV (organization validation), EV (extended validation). Let's Encrypt provides free DV certificates. TLS protects against: eavesdropping, tampering, and man-in-the-middle attacks.",
        difficulty: "medium"
    }
]

// ============================================================================
// LOCAL FALLBACK IMPLEMENTATION
// ============================================================================

function extractSkills(text) {
    if (!text) return new Set()
    const lowerText = text.toLowerCase()
    const foundSkills = new Set()

    // Helper to check if a word/phrase exists as a distinct word
    const hasWord = (phrase) => {
        // Escape special characters in phrase (like C++)
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`\\b${escaped}\\b`, 'i')
        
        // Special case for C++ / C# since \b doesn't work well with non-word chars
        if (phrase === 'c++') return lowerText.includes('c++')
        if (phrase === 'c#') return lowerText.includes('c#')
        
        return regex.test(lowerText)
    }

    // Check direct skill names
    for (const skillKey of Object.keys(SKILL_DATABASE)) {
        const skill = SKILL_DATABASE[skillKey]
        if (hasWord(skillKey) || hasWord(skill.displayName.toLowerCase())) {
            foundSkills.add(skillKey)
        }
    }

    // Check aliases
    for (const [alias, skillKey] of Object.entries(SKILL_ALIASES)) {
        if (hasWord(alias.toLowerCase())) {
            foundSkills.add(skillKey)
        }
    }

    return foundSkills
}

function detectRoleLevel(text) {
    if (!text) return "mid"
    const lower = text.toLowerCase()
    if (lower.includes("principal") || lower.includes("staff") || lower.includes("architect")) return "senior"
    if (lower.includes("senior") || lower.includes("lead") || lower.includes("sr.") || lower.includes("sr ")) return "senior"
    if (lower.includes("junior") || lower.includes("jr.") || lower.includes("jr ") || lower.includes("intern") || lower.includes("entry")) return "junior"
    return "mid"
}

function generateLocalFallback({ resume, selfDescription, jobDescription }) {
    console.log("[AI Fallback Chain] TIER 3: Generating intelligent local fallback...")

    try {
        // 1. Extract skills from job description
        const requiredSkills = extractSkills(jobDescription)
        const roleLevel = detectRoleLevel(jobDescription)

        console.log(`[AI Fallback Chain] TIER 3: Detected ${requiredSkills.size} skills in job description, role level: ${roleLevel}`)

        // 2. Extract skills from resume and self description
        const candidateSkills = new Set([
            ...extractSkills(resume),
            ...extractSkills(selfDescription)
        ])

        console.log(`[AI Fallback Chain] TIER 3: Detected ${candidateSkills.size} skills in candidate profile`)

        // 3. Calculate match score
        const matchedSkills = new Set([...requiredSkills].filter(s => candidateSkills.has(s)))
        const gapSkills = [...requiredSkills].filter(s => !candidateSkills.has(s))

        let matchScore
        if (requiredSkills.size > 0) {
            matchScore = Math.round((matchedSkills.size / requiredSkills.size) * 100)
        } else {
            matchScore = 60 // default when no specific skills detected
        }
        // Clamp to 35-95 range
        matchScore = Math.max(35, Math.min(95, matchScore))

        console.log(`[AI Fallback Chain] TIER 3: Match score: ${matchScore} (${matchedSkills.size}/${requiredSkills.size} skills matched)`)

        // 4. Generate technical questions (8 total)
        const technicalQuestions = []
        const usedQuestions = new Set()

        // First, pick questions from matched/required skills
        const allRelevantSkills = [...new Set([...requiredSkills, ...matchedSkills])]
        for (const skillKey of allRelevantSkills) {
            if (technicalQuestions.length >= 8) break
            const skill = SKILL_DATABASE[skillKey]
            if (!skill) continue
            for (const q of skill.questions) {
                if (technicalQuestions.length >= 8) break
                if (usedQuestions.has(q.question)) continue
                usedQuestions.add(q.question)
                technicalQuestions.push({
                    question: q.question,
                    intention: q.intention,
                    answer: q.answer,
                    difficulty: q.difficulty
                })
            }
        }

        // Fill remaining with general questions
        if (requiredSkills.size === 0) {
            const genericDomainQuestions = [
                { question: "Can you describe a complex problem you solved recently and the analytical steps you took?", intention: "Tests analytical and problem-solving abilities.", answer: "A strong answer will clearly define the problem, the methodology used to analyze it, the solution implemented, and the measurable results.", difficulty: "medium" },
                { question: "How do you ensure a high degree of accuracy and attention to detail in your daily work?", intention: "Tests commitment to quality and process orientation.", answer: "Look for specific techniques like double-checking work, using checklists, automated validation, peer reviews, or systematic approaches to minimizing errors.", difficulty: "medium" },
                { question: "Describe a time when you had to work independently with minimal supervision. How did you stay on track?", intention: "Tests autonomy, time management, and proactive initiative.", answer: "The candidate should demonstrate self-motivation, ability to prioritize tasks, regular self-reporting of progress, and knowing when to ask for help if blocked.", difficulty: "easy" },
                { question: "How do you handle technical inquiries from clients or non-technical stakeholders?", intention: "Tests communication skills and customer focus.", answer: "Good answers highlight empathy, avoiding jargon, active listening, and translating complex concepts into easily understandable terms.", difficulty: "medium" },
                { question: "Tell me about a time you identified a process improvement opportunity and took the initiative to implement it.", intention: "Tests proactive behavior and continuous improvement mindset.", answer: "Look for examples of identifying inefficiencies and taking ownership to create a better process, even if it wasn't strictly their responsibility.", difficulty: "hard" },
                { question: "How do you prioritize your work when faced with multiple urgent deadlines?", intention: "Tests time management and ability to handle pressure.", answer: "Strong candidates use frameworks like the Eisenhower matrix, communicate transparently with stakeholders about realistic timelines, and don't sacrifice quality for speed.", difficulty: "medium" },
                { question: "Can you provide an example of how you've applied your educational background to a practical work challenge?", intention: "Tests ability to translate theoretical knowledge into practical application.", answer: "Look for specific examples connecting their degree to analytical tasks, data interpretation, or structured problem-solving at work.", difficulty: "hard" },
                { question: "Describe your approach to learning a new industry standard or complex process quickly.", intention: "Tests adaptability and continuous learning.", answer: "Good answers outline a structured learning approach: finding official documentation, identifying subject matter experts, hands-on practice, and breaking down complex topics.", difficulty: "medium" }
            ]
            for (const q of genericDomainQuestions) {
                if (technicalQuestions.length >= 8) break
                technicalQuestions.push(q)
            }
        } else {
            // Tech role fallback
            for (const q of GENERAL_QUESTIONS) {
                if (technicalQuestions.length >= 8) break
                if (usedQuestions.has(q.question)) continue
                usedQuestions.add(q.question)
                technicalQuestions.push({
                    question: q.question,
                    intention: q.intention,
                    answer: q.answer,
                    difficulty: q.difficulty
                })
            }

            // If we still need more, pull from other skill categories
            if (technicalQuestions.length < 8) {
                for (const skillKey of Object.keys(SKILL_DATABASE)) {
                    if (technicalQuestions.length >= 8) break
                    const skill = SKILL_DATABASE[skillKey]
                    for (const q of skill.questions) {
                        if (technicalQuestions.length >= 8) break
                        if (usedQuestions.has(q.question)) continue
                        usedQuestions.add(q.question)
                        technicalQuestions.push({
                            question: q.question,
                            intention: q.intention,
                            answer: q.answer,
                            difficulty: q.difficulty
                        })
                    }
                }
            }
        }

        // 5. Generate behavioral questions (8 from curated set)
        const behavioralQuestions = BEHAVIORAL_QUESTIONS.slice(0, 8).map(q => ({
            question: q.question,
            intention: q.intention,
            answer: q.answer,
            category: q.category
        }))

        // 6. Generate skill gaps (up to 6)
        const skillGaps = gapSkills.slice(0, 6).map((skillKey, index) => {
            const skill = SKILL_DATABASE[skillKey]
            const displayName = skill ? skill.displayName : skillKey
            // Assign severity: first 2 are high (core), next 2 medium (preferred), rest low (nice-to-have)
            let severity
            if (index < 2) severity = "high"
            else if (index < 4) severity = "medium"
            else severity = "low"

            return {
                skill: displayName,
                severity,
                description: `The job description requires ${displayName} skills which are not prominently demonstrated in the candidate's resume. This is a ${severity}-priority gap that could impact interview performance.`,
                recommendation: `Dedicate focused learning time to ${displayName}. Start with official documentation, complete hands-on tutorials, build a small project demonstrating the skill, and study common interview questions related to ${displayName}.`
            }
        })

        // If we have fewer than 6 gaps and there are remaining skills, add generic gaps
        if (skillGaps.length < 6) {
            let genericGaps = []
            if (requiredSkills.size === 0) {
                // Non-tech role fallback
                genericGaps = [
                    { skill: "Domain-Specific Knowledge", severity: "high", description: "The job requires specific industry or domain knowledge that should be clearly articulated.", recommendation: "Research the specific industry mentioned in the job description and prepare to discuss how your background applies." },
                    { skill: "Analytical & Problem Solving", severity: "medium", description: "Most roles require strong analytical capabilities to solve day-to-day challenges.", recommendation: "Prepare examples of complex problems you've solved, focusing on your analytical approach and the results achieved." },
                    { skill: "Communication Skills", severity: "medium", description: "Clear communication is essential for collaborating with stakeholders and team members.", recommendation: "Practice explaining complex concepts simply and rehearse behavioral interview answers using the STAR format." },
                    { skill: "Process Adherence", severity: "low", description: "Commitment to quality and process orientation is often a key requirement.", recommendation: "Review industry standards relevant to the role and prepare examples of how you ensure quality in your work." }
                ]
            } else {
                // Tech role generic gaps
                genericGaps = [
                    { skill: "System Design", severity: "medium", description: "System design skills are essential for technical interviews, especially for mid-to-senior level positions.", recommendation: "Study common system design patterns (load balancing, caching, database sharding), practice designing systems like URL shorteners, chat applications, and social media feeds." },
                    { skill: "Data Structures & Algorithms", severity: "medium", description: "Strong DSA knowledge is fundamental for coding interviews and demonstrates problem-solving ability.", recommendation: "Practice on LeetCode/HackerRank daily, focus on arrays, trees, graphs, dynamic programming, and understand time/space complexity analysis." },
                    { skill: "Communication Skills", severity: "low", description: "Ability to articulate technical decisions clearly is important for collaborative work environments.", recommendation: "Practice explaining technical concepts to non-technical audiences, write technical blog posts, and rehearse behavioral interview answers using the STAR format." },
                    { skill: "Cloud Services", severity: "low", description: "Cloud platform knowledge is increasingly expected for modern development roles.", recommendation: "Get hands-on with a major cloud provider (AWS/Azure/GCP), complete a certification path, and deploy personal projects to cloud infrastructure." },
                    { skill: "Testing & Quality Assurance", severity: "low", description: "Testing proficiency demonstrates engineering maturity and commitment to code quality.", recommendation: "Learn testing frameworks for your primary language, practice TDD, understand the testing pyramid, and add tests to existing projects." },
                    { skill: "DevOps Practices", severity: "low", description: "Understanding CI/CD and infrastructure basics is valuable for full-stack roles.", recommendation: "Set up a CI/CD pipeline for a personal project using GitHub Actions or GitLab CI, learn Docker basics, and understand deployment strategies." }
                ]
            }
            
            for (const gap of genericGaps) {
                if (skillGaps.length >= 6) break
                // Don't add generic gap if we already have that skill
                if (!skillGaps.find(g => g.skill === gap.skill)) {
                    skillGaps.push(gap)
                }
            }
        }

        // 7. Generate 7-day preparation plan
        const topSkills = allRelevantSkills.slice(0, 4).map(k => {
            const s = SKILL_DATABASE[k]
            return s ? s.displayName : k
        }).join(", ") || "core technical skills"

        const topGaps = skillGaps.slice(0, 3).map(g => g.skill).join(", ") || "identified gaps"

        let preparationPlan = [];
        
        if (requiredSkills.size === 0) {
            // Generic analytical/domain-specific roadmap
            preparationPlan = [
                {
                    day: 1,
                    focus: "Industry & Role Research",
                    tasks: [
                        "Research the company thoroughly: products, recent news, and market position",
                        "Review the job description in detail and map your past experience to each specific requirement",
                        "Identify the core KPIs and metrics typically associated with this role",
                        "Review your resume and prepare to discuss each project and achievement in detail",
                        "Research common industry standards and regulations relevant to the role"
                    ]
                },
                {
                    day: 2,
                    focus: "Analytical Skills Preparation",
                    tasks: [
                        "Review your most complex past projects and break down the analytical steps you took",
                        "Prepare specific examples of how you've solved problems using data or evidence-based reasoning",
                        "Practice explaining your decision-making process for ambiguous situations",
                        "Review common analytical frameworks used in the industry",
                        "Address skill gaps: begin studying Domain-Specific Knowledge"
                    ]
                },
                {
                    day: 3,
                    focus: "Process & Quality Focus",
                    tasks: [
                        "Prepare examples demonstrating your attention to detail and high degree of accuracy",
                        "Review instances where you improved a process or identified an inefficiency",
                        "Practice explaining how you maintain quality during tight deadlines",
                        "Study the company's stated values regarding quality and operational excellence",
                        "Address skill gaps: focus on Process Adherence"
                    ]
                },
                {
                    day: 4,
                    focus: "Communication & Stakeholder Management",
                    tasks: [
                        "Prepare examples of how you communicate complex findings to non-technical stakeholders",
                        "Practice answers detailing how you handle client inquiries or pushback",
                        "Review your experience working independently vs. collaboratively",
                        "Rehearse behavioral answers using the STAR format (Situation, Task, Action, Result)",
                        "Address skill gaps: focus on Communication Skills"
                    ]
                },
                {
                    day: 5,
                    focus: "Mock Interviews & Refinement",
                    tasks: [
                        "Conduct a mock interview focusing on domain-specific scenarios",
                        "Practice answering 'curveball' analytical questions aloud",
                        "Refine your 'Tell me about yourself' pitch to highlight relevant analytical experience",
                        "Prepare thoughtful questions to ask the interviewers about the role and team",
                        "Review your complete preparation and get a good night's sleep"
                    ]
                }
            ];
        } else {
            // Tech-focused roadmap
            preparationPlan = [
                {
                    day: 1,
                    focus: "Fundamentals Review & Research",
                    tasks: [
                        "Research the company thoroughly: products, tech stack, culture, recent news, and engineering blog posts",
                        "Review the job description in detail and map your experience to each requirement",
                        `Review core fundamentals of ${topSkills}`,
                        "Set up a clean development environment for practice coding",
                        "Review your resume and prepare to discuss each project and achievement in detail"
                    ]
                },
                {
                    day: 2,
                    focus: "Core Technical Skills Practice",
                    tasks: [
                        `Deep dive into ${allRelevantSkills.length > 0 ? SKILL_DATABASE[allRelevantSkills[0]]?.displayName || allRelevantSkills[0] : "primary technologies"}: review documentation and best practices`,
                        "Solve 3-4 medium-difficulty coding problems on LeetCode focusing on arrays and strings",
                        "Review common design patterns relevant to the role",
                        `Practice building a small project using ${topSkills}`,
                        "Review and practice explaining your most impactful past projects"
                    ]
                },
                {
                    day: 3,
                    focus: "Advanced Technical Topics",
                    tasks: [
                        `Study advanced concepts in ${allRelevantSkills.length > 1 ? SKILL_DATABASE[allRelevantSkills[1]]?.displayName || allRelevantSkills[1] : "secondary technologies"}`,
                        "Solve 3-4 coding problems focusing on trees, graphs, and dynamic programming",
                        "Review database design principles and write practice queries",
                        "Study API design best practices and common patterns",
                        `Address skill gaps: begin studying ${topGaps}`
                    ]
                },
                {
                    day: 4,
                    focus: "System Design & Architecture",
                    tasks: [
                        "Study system design fundamentals: scalability, load balancing, caching, database sharding",
                        "Practice designing a URL shortener, chat system, or social media feed",
                        "Review microservices vs monolith trade-offs and when to use each",
                        "Study CAP theorem, eventual consistency, and distributed system concepts",
                        "Practice whiteboard-style system design: draw diagrams and explain decisions aloud"
                    ]
                },
                {
                    day: 5,
                    focus: "Advanced Problem Solving & Skill Gaps",
                    tasks: [
                        "Solve 4-5 hard coding problems focusing on algorithms and optimization",
                        `Continue addressing skill gaps in ${topGaps}`,
                        "Review security best practices: OWASP top 10, authentication, authorization",
                        "Practice code review: find and fix bugs in sample code snippets",
                        "Study performance optimization techniques for both frontend and backend"
                    ]
                }
            ]
        }

        // Add the behavioral and final review days to whatever plan was chosen
        preparationPlan.push(
            {
                day: 6,
                focus: "Behavioral & Soft Skills Preparation",
                tasks: [
                    "Prepare 8-10 STAR-format stories covering leadership, teamwork, conflict resolution, and failure",
                    "Practice answering 'Tell me about yourself' with a compelling 2-minute narrative",
                    "Prepare thoughtful questions to ask the interviewer about team, culture, and technical challenges",
                    "Practice explaining past decisions you've made and the trade-offs involved",
                    "Review your understanding of team processes and how you've applied them"
                ]
            },
            {
                day: 7,
                focus: "Mock Interviews & Final Review",
                tasks: [
                    "Do a full mock interview focusing on the core skills required",
                    "Do a mock behavioral interview with a friend or using an AI interview tool",
                    "Review all notes, flashcards, and weak areas identified during the week",
                    "Prepare logistics: test video/audio setup, plan arrival time, choose professional attire",
                    "Get a good night's rest — confidence and composure are as important as knowledge"
                ]
            }
        );

        // Generate a reasonable title
        let title = requiredSkills.size === 0 ? "Professional Role" : "Software Engineer"
        const jobLower = (jobDescription || "").toLowerCase()
        
        if (jobLower.includes("data analyst") || jobLower.includes("data analysis") || jobLower.includes("analyst") || jobLower.includes("analytics")) {
            title = roleLevel === "senior" ? "Senior Analyst" : roleLevel === "junior" ? "Junior Analyst" : "Data Analyst"
        } else if (jobLower.includes("python")) {
            title = roleLevel === "senior" ? "Senior Python Developer" : roleLevel === "junior" ? "Junior Python Developer" : "Python Developer"
        } else if (jobLower.includes("frontend") || jobLower.includes("front-end") || jobLower.includes("front end")) {
            title = roleLevel === "senior" ? "Senior Frontend Developer" : roleLevel === "junior" ? "Junior Frontend Developer" : "Frontend Developer"
        } else if (jobLower.includes("backend") || jobLower.includes("back-end") || jobLower.includes("back end")) {
            title = roleLevel === "senior" ? "Senior Backend Developer" : roleLevel === "junior" ? "Junior Backend Developer" : "Backend Developer"
        } else if (jobLower.includes("full stack") || jobLower.includes("fullstack") || jobLower.includes("full-stack")) {
            title = roleLevel === "senior" ? "Senior Full Stack Developer" : roleLevel === "junior" ? "Junior Full Stack Developer" : "Full Stack Developer"
        } else if (jobLower.includes("devops")) {
            title = roleLevel === "senior" ? "Senior DevOps Engineer" : "DevOps Engineer"
        } else if (jobLower.includes("data scientist") || jobLower.includes("machine learning") || jobLower.includes("ml engineer") || jobLower.includes("ai engineer")) {
            title = roleLevel === "senior" ? "Senior ML/AI Engineer" : "Machine Learning Engineer"
        } else if (jobLower.includes("mobile") || jobLower.includes("ios") || jobLower.includes("android") || jobLower.includes("react native") || jobLower.includes("flutter")) {
            title = roleLevel === "senior" ? "Senior Mobile Developer" : "Mobile Developer"
        } else if (jobLower.includes("cloud") || jobLower.includes("aws") || jobLower.includes("azure") || jobLower.includes("gcp")) {
            title = roleLevel === "senior" ? "Senior Cloud Engineer" : "Cloud Engineer"
        } else if (jobLower.includes("manager") || jobLower.includes("lead")) {
            title = "Technical Lead / Manager"
        } else if (jobLower.includes("security") || jobLower.includes("cybersecurity")) {
            title = roleLevel === "senior" ? "Senior Security Engineer" : "Security Engineer"
        } else {
            title = roleLevel === "senior" ? "Senior Software Engineer" : roleLevel === "junior" ? "Junior Software Engineer" : "Software Engineer"
        }

        console.log(`[AI Fallback Chain] TIER 3: Local fallback generated successfully — title: "${title}", matchScore: ${matchScore}`)

        return {
            title,
            matchScore,
            technicalQuestions,
            behavioralQuestions,
            skillGaps,
            preparationPlan,
            aiProvider: "local"
        }
    } catch (error) {
        // The local fallback should NEVER throw — return safe defaults
        console.error("[AI Fallback Chain] TIER 3: Error in local fallback (returning safe defaults):", error.message)
        return {
            title: "Software Developer",
            matchScore: 60,
            technicalQuestions: GENERAL_QUESTIONS.slice(0, 5).concat(
                Object.values(SKILL_DATABASE).flatMap(s => s.questions).slice(0, 3)
            ).map(q => ({
                question: q.question,
                intention: q.intention,
                answer: q.answer,
                difficulty: q.difficulty || "medium"
            })),
            behavioralQuestions: BEHAVIORAL_QUESTIONS.slice(0, 8).map(q => ({
                question: q.question,
                intention: q.intention,
                answer: q.answer,
                category: q.category
            })),
            skillGaps: [
                { skill: "Technical Proficiency", severity: "medium", description: "General technical skills assessment.", recommendation: "Review core computer science fundamentals and practice coding problems." }
            ],
            preparationPlan: [
                { day: 1, focus: "Fundamentals Review", tasks: ["Review core CS concepts", "Research the company", "Set up practice environment", "Review resume"] },
                { day: 2, focus: "Technical Practice", tasks: ["Solve coding problems", "Review data structures", "Practice algorithms", "Build a small project"] },
                { day: 3, focus: "Advanced Topics", tasks: ["Study system design", "Review design patterns", "Practice database queries", "Review API design"] },
                { day: 4, focus: "System Design", tasks: ["Practice designing distributed systems", "Study scalability patterns", "Review caching strategies", "Study load balancing"] },
                { day: 5, focus: "Problem Solving", tasks: ["Solve hard coding problems", "Review optimization techniques", "Practice code reviews", "Study security basics"] },
                { day: 6, focus: "Behavioral Prep", tasks: ["Prepare STAR stories", "Practice common questions", "Prepare questions for interviewer", "Review soft skills"] },
                { day: 7, focus: "Final Review", tasks: ["Mock interview practice", "Review weak areas", "Prepare logistics", "Rest and relax"] }
            ],
            aiProvider: "local"
        }
    }
}

// ============================================================================
// MAIN ENTRY POINT — 3-TIER FALLBACK CHAIN
// ============================================================================

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {
    console.log("=".repeat(60))
    console.log("[AI Fallback Chain] Starting interview report generation...")
    console.log("=".repeat(60))

    // TIER 1: Gemini
    try {
        const result = await tryGemini({ resume, selfDescription, jobDescription })
        return result
    } catch (error) {
        console.error("[AI Fallback Chain] TIER 1 FAILED (Gemini):", error.message || error)
        console.log("[AI Fallback Chain] Falling through to Tier 2 (OpenAI)...")
    }

    // TIER 2: OpenAI
    try {
        const result = await tryOpenAI({ resume, selfDescription, jobDescription })
        return result
    } catch (error) {
        console.error("[AI Fallback Chain] TIER 2 FAILED (OpenAI):", error.message || error)
        console.log("[AI Fallback Chain] Falling through to Tier 3 (Local Fallback)...")
    }

    // TIER 3: Local fallback (never throws)
    const result = generateLocalFallback({ resume, selfDescription, jobDescription })
    console.log("[AI Fallback Chain] TIER 3: Local fallback completed ✓")
    return result
}

// ============================================================================
// RESUME PDF GENERATION (UNCHANGED)
// ============================================================================

function sanitizeForPdf(text) {
    if (!text) return ""
    return text
        .replace(/\r/g, "") // Remove carriage returns
        .replace(/[\u2018\u2019]/g, "'") // curly single quotes
        .replace(/[\u201C\u201D]/g, '"') // curly double quotes
        .replace(/[\u2013\u2014]/g, "-") // em/en dashes
        .replace(/[\u2026]/g, "...")     // ellipsis
        .replace(/[^\x00-\x7F]/g, "-")   // replace other non-ascii (like bullets) with dash
}

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription
}) {

    return new Promise((resolve, reject) => {

        const doc = new PDFDocument({
            margin: 50
        })

        const buffers = []

        doc.on("data", buffers.push.bind(buffers))

        doc.on("end", () => {

            const pdfData = Buffer.concat(buffers)

            resolve(pdfData)
        })

        // HEADER
        doc
            .fontSize(26)
            .fillColor("#2563eb")
            .text("AI Optimized Resume", {
                align: "center"
            })

        doc.moveDown(2)

        // SUMMARY
        doc
            .fontSize(18)
            .fillColor("black")
            .text("Professional Summary")

        doc.moveDown()

        doc
            .fontSize(12)
            .fillColor("#444")
            .text(sanitizeForPdf(selfDescription) || "No summary provided")

        doc.moveDown(2)

        // RESUME CONTENT
        doc
            .fontSize(18)
            .fillColor("black")
            .text("Experience & Skills")

        doc.moveDown()

        doc
            .fontSize(12)
            .fillColor("#444")
            .text(sanitizeForPdf(resume) || "No resume content")

        doc.end()
    })
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    generateInterviewReport,
    generateResumePdf
}