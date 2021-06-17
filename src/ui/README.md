# Accelerator UI

The Accelerator UI provides a web application IO to manage Accelerator configuration. The UI uses the Accelerator configuration type definition to automatically render the correct UI fields. Every Accelerator configuration type change will automatically be reflected in the UI.

## Getting Started

To run the application in development mode, run the following commands.

```shell
pnpm install
pnpm run start
```

The application is now accessible in the browser at [http://localhost:3000](http://localhost:3000).

To compile the application for distribution you can run the following commands.

```shell
pnpm run build
```

The `build` directory now contains the compiled application.

## Folder Structure

```
src
├── components          # Reusable React components across the project.
│   └── fields          # Reusable React components that render fields for the corresponding `io-ts` types.
├── pages
│   ├── advanced        # React components to build the advanced page.
│   ├── default         # Default React components to reuse in other pages.
│   ├── editor          # React components to build the editor page.
│   ├── home            # React components to build the home page.
│   └── wizards         # React components to build the wizard page.
│       ├── components  # Reusable React components that render fields for the wizards.
│       └── steps       # React components to render steps in the wizard page.
└── utils
```

## Architecture

The following decisions are important to understand the architecture of the application:

- The whole Accelerator configuration object is managed with the [https://mobx.js.org](MobX library).
- The UI components are rendered with React;
- The UI "Advanced Configuration" page renders input fields automatically based on the Accelerator configuration type definition;

### Fields

As stated before, the "Advanced Configuration" page renders input fields automatically. The Accelerator configuration is defined using the `io-ts` library. This library allows us to define the Accelerator configuration schema in TypeScript and it also allows us to introspect the schema.

To automatically render input fields for the configuration schema we just have to introspect the configuration schema and render a relevant React component for every `io-ts` type.

If you look in the `src/components/fields` folder you'll see different React components that are each responsible for rendering a specific `io-ts` type. For example:

- `boolean.tsx` renders the `io-ts` `BooleanType`;
- `string.tsx` renders the `io-ts` `StringType`;
- `interface.tsx` renders the `io-ts` `InterfaceType`;
- `array.tsx` renders the `io-ts` `ArrayType`;

The most important React field component is in the `field.tsx` file. This component accepts any `io-ts` type and delegates rendering to the correct field component.

Some `io-ts` types have nested types, such as `InterfaceType`, `ArrayType`, `UnionType`, etc. These fields recursively render their nested types. For example:

```tsx
/**
 * Simplified example of `InterfaceField`.
 */
export const InterfaceField = function <T extends t.InterfaceType<any>>(props: FieldProps<T>) {
  const { node, state } = props;
  // Render all fields of the InterfaceType
  const fields = Object.keys(properties).map((key, index) => {
    const propertyNode = node.nested(key);
    return <Field state={state} node={propertyNode} />; // Render the nested type
  });
  return <SpaceBetween size="l">{fields}</SpaceBetween>;
};
```

The variables `node` and `state` will become clear as you read through the next sections.

### Type Tree

The Accelerator configuration schema is preprocessed and converted to a tree structure. The tree consists of `TypeTreeNode`s that contain information about the configuration schema in a structure that is simpler for our fields to render.

```typescript
/**
 * Auxiliary interface that defines a node in a type tree.
 */
export interface TypeTreeNode<T extends t.Any = t.Any> {
  /**
   * The parent node.
   */
  readonly parent?: TypeTreeNode;
  /**
   * The path of this node in the type tree.
   */
  readonly path: Path;
  /**
   * The type of this node.
   */
  readonly type: t.Any;
  /**
   * The underlying raw type of this node.
   */
  readonly rawType: T;
  /**
   * The metadata that was extracted from the type.
   */
  readonly metadata: TypeMetadata;
  /**
   * Return a child node at the given path fragment.
   */
  nested(fragment: Fragment): TypeTreeNode;
  /**
   * Get the value of the current node in the given state.
   */
  get(state: any): t.TypeOf<T>;
  /**
   * Set the value of the current node in the given state to the given value.
   */
  set(state: any, value: t.TypeOf<T> | undefined): void;
}

export interface TypeMetadata {
  readonly title?: string;
  readonly label?: string;
  readonly description?: string;
  readonly defaultValue?: any;
  readonly enumLabels?: Record<string | number, string>;
  readonly optional?: boolean;
  readonly min?: number;
  readonly max?: number;
}
```

For example you might have the type:

```typescript
const Vpc = t.interface({
  accountName: t.optional(t.nonEmptyString),
  cidrs: t.array(t.cidr),
});
```

The tree for the above type would look something like this:

```
root (Vpc)
├── accountName
│   ├── parent: root
│   ├── path: ['accountName']
│   ├── type: OptionalType<SizedType<StringType>>
│   ├── rawType: StringType
│   ├── metadata
│   │   ├── optional: true
│   │   └── min: 1
├── cidrs
│   ├── parent: root
│   ├── path: ['cidrs']
│   ├── type: ArrayType<CidrType>
│   ├── rawType: ArrayType
│   ├── nested
│   │   ├── 0
│   │   │   ├── parent: cidrs
│   │   │   ├── path: ['cidrs', 0]
│   │   │   ├── type: CidrType
│   │   │   └── rawType: ArrayType
```

You can find the code that builds the tree in `src/types.ts`.

This tree structure is pretty straightforward for a field to render:

- The delegating field component `Field` in `src/fields/field.tsx` looks at the `rawType` in a given `node` and delegates rendering to the corresponding field component. In case of the node `accountName` the `StringField` will render the node.
- This `StringField` component can then use the metadata to render the title and description for this node. The field also takes care of validation by using the `type` in the node.

Every field component reads and modifies the configuration state. This state is a [https://mobx.js.org/observable-state.html](Mobx observable). Every field component takes this state as a property so the field component can read and modify the state.

### State

The configuration state object is a MobX observable that is initialized in the React context `src/components/accelerator-config-context.tsx`. This context is created in `src/app.tsx` by wrapping components in `AcceleratorConfigProvider`.

The power of a MobX observable is that React components automatically re-render when the observable is changed. All React field components need to be wrapped with `observer` in order to listen to MobX observable changes.
