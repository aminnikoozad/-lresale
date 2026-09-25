create or replace function public.support_search_approved_knowledge(p_query text, p_limit integer default 12)
returns table(id uuid, title text, approved_answer text, question_examples text[], tags text[], category_code text, score numeric)
language sql
stable
security invoker
set search_path = ''
as $function$
  with q as (
    select lower(trim(coalesce(p_query,''))) as raw,
           regexp_split_to_array(lower(trim(coalesce(p_query,''))), '[^[:alnum:]$]+') as toks
  ), scored as (
    select kb.id,kb.title,kb.approved_answer,kb.question_examples,kb.tags,kb.category_code,
      (
        case when lower(kb.title)=q.raw then 20 else 0 end
        + 6*(select count(*) from unnest(coalesce(kb.tags,'{}'::text[])) tag
             where length(tag)>=3 and q.raw like '%'||lower(tag)||'%')
        + 4*(select count(*) from unnest(coalesce(kb.question_examples,'{}'::text[])) ex
             where length(ex)>=4 and (q.raw=lower(ex) or q.raw like '%'||lower(ex)||'%' or lower(ex) like '%'||q.raw||'%'))
        + 1.5*(select count(*) from unnest(q.toks) tok
             where length(tok)>=3 and position(tok in lower(concat_ws(' ',kb.title,kb.approved_answer,
               array_to_string(coalesce(kb.question_examples,'{}'::text[]),' '),
               array_to_string(coalesce(kb.tags,'{}'::text[]),' '))))>0)
        + 10 * greatest(
            extensions.similarity(q.raw, lower(concat_ws(' ',kb.title,kb.approved_answer,
              array_to_string(coalesce(kb.question_examples,'{}'::text[]),' '),
              array_to_string(coalesce(kb.tags,'{}'::text[]),' ')))),
            extensions.word_similarity(q.raw, lower(concat_ws(' ',kb.title,kb.approved_answer,
              array_to_string(coalesce(kb.question_examples,'{}'::text[]),' '),
              array_to_string(coalesce(kb.tags,'{}'::text[]),' '))))
          )
        + 6 * coalesce((select max(extensions.similarity(q.raw, lower(ex)))
                        from unnest(coalesce(kb.question_examples,'{}'::text[])) ex),0)
      )::numeric as score
    from public.knowledge_base kb cross join q
    where kb.status='approved' and length(q.raw) > 0
  )
  select s.* from scored s where s.score >= 2.5
  order by s.score desc,s.title asc
  limit least(greatest(coalesce(p_limit,12),1),20);
$function$;

revoke all on function public.support_search_approved_knowledge(text, integer) from public, anon, authenticated;
grant execute on function public.support_search_approved_knowledge(text, integer) to service_role;
