use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input, Attribute, Path, Token,
};

struct CommandItem {
    /// The tokens inside `#[cfg(...)]`, e.g. `desktop` or `target_os = "windows"`.
    /// `None` means the command is always compiled in.
    cfg_tokens: Option<TokenStream2>,
    path: Path,
}

struct CommandList(Vec<CommandItem>);

impl Parse for CommandList {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut items = vec![];
        while !input.is_empty() {
            let attrs = Attribute::parse_outer(input)?;
            let path: Path = input.parse()?;

            // Extract the first #[cfg(...)] attribute if present.
            // Any other attributes are ignored (they wouldn't make sense here anyway).
            let cfg_tokens = attrs.iter().find_map(|attr| {
                if !attr.path().is_ident("cfg") {
                    return None;
                }
                attr.meta
                    .require_list()
                    .ok()
                    .map(|list| list.tokens.clone())
            });

            items.push(CommandItem { cfg_tokens, path });

            // Consume optional trailing comma
            if input.peek(Token![,]) {
                let _ = input.parse::<Token![,]>();
            }
        }
        Ok(CommandList(items))
    }
}

/// A drop-in replacement for `tauri_specta::collect_commands!` that supports
/// `#[cfg(...)]` attributes on individual commands.
///
/// # Example
/// ```rust
/// collect_commands![
///     #[cfg(desktop)]
///     desktop_tray::set_close_to_tray_enabled,
///     windows::snap_overlay::show_snap_overlay,
///     windows::snap_overlay::hide_snap_overlay,
/// ]
/// ```
///
/// # How it works
///
/// For each unique cfg predicate P found in the list the macro generates two
/// complete `tauri_specta::internal::command(generate_handler![...],
/// collect_functions![...])` calls — one for `#[cfg(P)]` (including those
/// commands) and one for `#[cfg(not(P))]` (excluding them).  The compiler
/// picks exactly one branch per target, so every command path only needs to
/// exist on the targets where its cfg condition is true.
///
/// For N distinct predicates, 2^N branches are emitted.  In practice only
/// `#[cfg(desktop)]` is used so this is always just two branches.
#[proc_macro]
pub fn collect_commands(input: TokenStream) -> TokenStream {
    let CommandList(items) = parse_macro_input!(input as CommandList);

    // Collect the unique cfg predicates present in this invocation.
    let mut predicates: Vec<TokenStream2> = vec![];
    for item in &items {
        if let Some(cfg) = &item.cfg_tokens {
            let key = cfg.to_string();
            if !predicates
                .iter()
                .any(|p: &TokenStream2| p.to_string() == key)
            {
                predicates.push(cfg.clone());
            }
        }
    }

    let n = predicates.len();
    let num_variants = 1usize << n; // 2^n — always at least 1

    let mut branches: Vec<TokenStream2> = vec![];

    for variant in 0..num_variants {
        // For variant `v`, bit `i` being set means predicate[i] is "active"
        // (true) for this branch.

        // Build `#[cfg(all(pred0_or_not, pred1_or_not, ...))]`
        let conditions: Vec<TokenStream2> = predicates
            .iter()
            .enumerate()
            .map(|(i, pred)| {
                if variant & (1 << i) != 0 {
                    quote! { #pred }
                } else {
                    quote! { not(#pred) }
                }
            })
            .collect();

        let cfg_guard: TokenStream2 = if conditions.is_empty() {
            // No predicates at all — unconditional (wrapping in all() is valid).
            quote! {}
        } else {
            quote! { #[cfg(all(#(#conditions),*))] }
        };

        // Collect commands that are visible in this variant:
        //   - always-on commands (no cfg attribute) are always included
        //   - cfg-gated commands are included only when their predicate bit is set
        let variant_paths: Vec<&Path> = items
            .iter()
            .filter(|item| match &item.cfg_tokens {
                None => true, // always-on
                Some(cfg) => {
                    let key = cfg.to_string();
                    let idx = predicates
                        .iter()
                        .position(|p| p.to_string() == key)
                        .unwrap();
                    variant & (1 << idx) != 0
                }
            })
            .map(|item| &item.path)
            .collect();

        branches.push(quote! {
            #cfg_guard
            let __commands = ::tauri_specta::internal::command(
                ::tauri::generate_handler![#(#variant_paths),*],
                ::specta::function::collect_functions![#(#variant_paths),*],
            );
        });
    }

    quote! {
        {
            #(#branches)*
            __commands
        }
    }
    .into()
}
